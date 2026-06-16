import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ExpenseStatus,
  ExpenseSplitType,
  Prisma,
  SettlementStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GroupAccessService } from '../groups/group-access.service';
import {
  CreateExpenseDto,
  ExpenseItemInputDto,
  ExpenseParticipantInputDto,
  PaidByDto,
} from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ListExpensesDto } from './dto/list-expenses.dto';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { ActivityService } from '../activity/activity.service';
import { CreateSplitRuleDto } from './dto/create-split-rule.dto';

const MONEY_SCALE = 100;

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groupAccessService: GroupAccessService,
    private readonly activityService: ActivityService,
  ) {}

  private toCents(value: number): number {
    return Math.round(Number(value) * MONEY_SCALE);
  }

  private toAmount(cents: number): number {
    return cents / MONEY_SCALE;
  }

  private ensureEquals(
    expectedCents: number,
    actualCents: number,
    message: string,
  ) {
    if (expectedCents !== actualCents) {
      throw new BadRequestException(message);
    }
  }

  private distributeEvenly(totalCents: number, userIds: number[]) {
    const base = Math.floor(totalCents / userIds.length);
    let remainder = totalCents % userIds.length;
    return userIds.map((userId) => {
      const allocated = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) {
        remainder -= 1;
      }

      return {
        userId,
        amountCents: allocated,
      };
    });
  }

  private validateGroupMembership(
    groupMemberIds: number[],
    userIds: number[],
    context: string,
  ) {
    const memberSet = new Set(groupMemberIds);
    const invalid = userIds.filter((userId) => !memberSet.has(userId));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `${context}: users ${invalid.join(', ')} are not members of this group`,
      );
    }
  }

  private normalizeCurrency(currency: string | undefined, fallback: string) {
    return (currency ?? fallback).toUpperCase();
  }

  private buildOwedAllocations(
    splitType: ExpenseSplitType,
    totalCents: number,
    participants: ExpenseParticipantInputDto[],
    items?: ExpenseItemInputDto[],
  ) {
    if (participants.length === 0) {
      throw new BadRequestException('At least one participant is required');
    }

    const uniqueCount = new Set(participants.map((p) => p.userId)).size;
    if (uniqueCount !== participants.length) {
      throw new BadRequestException('Participants cannot contain duplicates');
    }

    if (splitType === ExpenseSplitType.EQUAL) {
      return this.distributeEvenly(
        totalCents,
        participants.map((p) => p.userId),
      );
    }

    if (splitType === ExpenseSplitType.UNEQUAL) {
      const mapped = participants.map((p) => ({
        userId: p.userId,
        amountCents: this.toCents(p.exactAmount ?? 0),
      }));
      this.ensureEquals(
        totalCents,
        mapped.reduce((sum, p) => sum + p.amountCents, 0),
        'Unequal split amounts must add up to total amount',
      );
      return mapped;
    }

    if (splitType === ExpenseSplitType.PERCENTAGE) {
      const raw = participants.map((p) => ({
        userId: p.userId,
        pct: Number(p.percentage ?? 0),
      }));
      const totalPct = raw.reduce((sum, p) => sum + p.pct, 0);
      if (Math.abs(totalPct - 100) > 0.001) {
        throw new BadRequestException('Percentages must total 100');
      }

      const provisional = raw.map((entry) => {
        const exact = (totalCents * entry.pct) / 100;
        return {
          userId: entry.userId,
          amountCents: Math.floor(exact),
          remainder: exact - Math.floor(exact),
        };
      });

      let assigned = provisional.reduce((sum, p) => sum + p.amountCents, 0);
      let remainderCents = totalCents - assigned;
      provisional.sort((a, b) => b.remainder - a.remainder);

      for (
        let idx = 0;
        idx < provisional.length && remainderCents > 0;
        idx += 1
      ) {
        provisional[idx].amountCents += 1;
        remainderCents -= 1;
      }

      assigned = provisional.reduce((sum, p) => sum + p.amountCents, 0);
      this.ensureEquals(
        totalCents,
        assigned,
        'Percentage split rounding failed to match total amount',
      );

      return provisional.map((entry) => ({
        userId: entry.userId,
        amountCents: entry.amountCents,
      }));
    }

    if (splitType === ExpenseSplitType.SHARE) {
      const totalShares = participants.reduce(
        (sum, p) => sum + (p.shares ?? 0),
        0,
      );
      if (totalShares <= 0) {
        throw new BadRequestException(
          'Share split requires shares greater than 0',
        );
      }

      const provisional = participants.map((p) => {
        const exact = (totalCents * (p.shares ?? 0)) / totalShares;
        return {
          userId: p.userId,
          amountCents: Math.floor(exact),
          remainder: exact - Math.floor(exact),
        };
      });

      let remainderCents =
        totalCents - provisional.reduce((sum, p) => sum + p.amountCents, 0);
      provisional.sort((a, b) => b.remainder - a.remainder);
      for (
        let idx = 0;
        idx < provisional.length && remainderCents > 0;
        idx += 1
      ) {
        provisional[idx].amountCents += 1;
        remainderCents -= 1;
      }

      return provisional.map((entry) => ({
        userId: entry.userId,
        amountCents: entry.amountCents,
      }));
    }

    if (splitType === ExpenseSplitType.ADJUSTMENT) {
      const base = this.distributeEvenly(
        totalCents,
        participants.map((p) => p.userId),
      );

      const adjustments = new Map<number, number>();
      for (const participant of participants) {
        adjustments.set(
          participant.userId,
          this.toCents(participant.adjustmentAmount ?? 0),
        );
      }

      const adjusted = base.map((entry) => ({
        userId: entry.userId,
        amountCents: entry.amountCents + (adjustments.get(entry.userId) ?? 0),
      }));

      this.ensureEquals(
        totalCents,
        adjusted.reduce((sum, p) => sum + p.amountCents, 0),
        'Adjustment split must still equal total amount',
      );

      return adjusted;
    }

    if (splitType === ExpenseSplitType.ITEMIZED) {
      if (!items || items.length === 0) {
        throw new BadRequestException('Itemized split requires items');
      }

      const owedByUser = new Map<number, number>();
      let itemsTotalCents = 0;

      for (const item of items) {
        const quantity = item.quantity ?? 1;
        const itemCents = this.toCents(item.amount) * quantity;
        itemsTotalCents += itemCents;

        if (!item.participantUserIds?.length) {
          throw new BadRequestException(
            `Item ${item.name} requires at least one participant`,
          );
        }

        const shares = this.distributeEvenly(
          itemCents,
          item.participantUserIds,
        );
        for (const share of shares) {
          owedByUser.set(
            share.userId,
            (owedByUser.get(share.userId) ?? 0) + share.amountCents,
          );
        }
      }

      this.ensureEquals(
        totalCents,
        itemsTotalCents,
        'Sum of itemized amounts must equal total amount',
      );

      return Array.from(owedByUser.entries()).map(([userId, amountCents]) => ({
        userId,
        amountCents,
      }));
    }

    throw new BadRequestException('Unsupported split type');
  }

  private buildPaidAllocations(totalCents: number, paidBy: PaidByDto[]) {
    if (paidBy.length === 0) {
      throw new BadRequestException('At least one payer is required');
    }

    const mapped = paidBy.map((entry) => ({
      userId: entry.userId,
      amountCents: this.toCents(entry.amount),
    }));

    const uniqueCount = new Set(mapped.map((p) => p.userId)).size;
    if (uniqueCount !== mapped.length) {
      throw new BadRequestException('Payers cannot contain duplicates');
    }

    this.ensureEquals(
      totalCents,
      mapped.reduce((sum, payer) => sum + payer.amountCents, 0),
      'Paid-by amounts must add up to total amount',
    );

    return mapped;
  }

  async create(groupId: number, userId: number, dto: CreateExpenseDto) {
    await this.groupAccessService.ensureMember(groupId, userId);

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: { members: true },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const totalCents = this.toCents(dto.totalAmount);
    if (totalCents <= 0) {
      throw new BadRequestException('Total amount should be greater than zero');
    }

    const paidAllocations = this.buildPaidAllocations(totalCents, dto.paidBy);
    const owedAllocations = this.buildOwedAllocations(
      dto.splitType,
      totalCents,
      dto.participants,
      dto.items,
    );

    const allUsers = [
      ...paidAllocations.map((p) => p.userId),
      ...owedAllocations.map((p) => p.userId),
    ];
    this.validateGroupMembership(
      group.members.map((member) => member.userId),
      allUsers,
      'Expense references invalid users',
    );

    const owedMap = new Map<number, number>();
    for (const owed of owedAllocations) {
      owedMap.set(
        owed.userId,
        (owedMap.get(owed.userId) ?? 0) + owed.amountCents,
      );
    }

    const paidMap = new Map<number, number>();
    for (const paid of paidAllocations) {
      paidMap.set(
        paid.userId,
        (paidMap.get(paid.userId) ?? 0) + paid.amountCents,
      );
    }

    const combinedUserIds = Array.from(
      new Set([...owedMap.keys(), ...paidMap.keys()]),
    );

    const currency = this.normalizeCurrency(
      dto.currency,
      group.defaultCurrency,
    );
    const expenseDate = dto.expenseDate
      ? new Date(dto.expenseDate)
      : new Date();

    const expense = await this.prisma.expense.create({
      data: {
        groupId,
        createdById: userId,
        title: dto.title,
        totalAmount: new Prisma.Decimal(this.toAmount(totalCents)),
        currency,
        category: dto.category,
        notes: dto.notes,
        attachmentUrl: dto.attachmentUrl,
        expenseDate,
        splitType: dto.splitType,
        isRecurring: dto.isRecurring ?? false,
        recurringRule: dto.recurringRule,
        participants: {
          create: combinedUserIds.map((participantUserId) => {
            const original = dto.participants.find(
              (participant) => participant.userId === participantUserId,
            );
            return {
              userId: participantUserId,
              owedAmount: new Prisma.Decimal(
                this.toAmount(owedMap.get(participantUserId) ?? 0),
              ),
              paidAmount: new Prisma.Decimal(
                this.toAmount(paidMap.get(participantUserId) ?? 0),
              ),
              exactAmount:
                original?.exactAmount !== undefined
                  ? new Prisma.Decimal(original.exactAmount)
                  : undefined,
              percentage:
                original?.percentage !== undefined
                  ? new Prisma.Decimal(original.percentage)
                  : undefined,
              shares: original?.shares,
              adjustmentAmount:
                original?.adjustmentAmount !== undefined
                  ? new Prisma.Decimal(original.adjustmentAmount)
                  : undefined,
              metadata: {
                inputSplitType: dto.splitType,
              },
            };
          }),
        },
        items: dto.items?.length
          ? {
              create: dto.items.map((item) => {
                const quantity = item.quantity ?? 1;
                const itemAmount = Number(item.amount) * quantity;
                const allocations = this.distributeEvenly(
                  this.toCents(itemAmount),
                  item.participantUserIds,
                );
                return {
                  name: item.name,
                  amount: new Prisma.Decimal(itemAmount),
                  quantity,
                  participants: {
                    create: allocations.map((allocation) => ({
                      userId: allocation.userId,
                      amount: new Prisma.Decimal(
                        this.toAmount(allocation.amountCents),
                      ),
                    })),
                  },
                };
              }),
            }
          : undefined,
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, email: true, username: true } },
          },
        },
        items: {
          include: {
            participants: true,
          },
        },
      },
    });

    await this.activityService.log({
      groupId,
      actorId: userId,
      action: 'EXPENSE_CREATED',
      entityType: 'Expense',
      entityId: expense.id,
      metadata: {
        title: expense.title,
        amount: expense.totalAmount.toString(),
        splitType: expense.splitType,
      },
    });

    return expense;
  }

  async list(groupId: number, userId: number, filters: ListExpensesDto) {
    await this.groupAccessService.ensureMember(groupId, userId);

    return this.prisma.expense.findMany({
      where: {
        groupId,
        status: ExpenseStatus.ACTIVE,
        ...(filters.query
          ? {
              OR: [
                { title: { contains: filters.query, mode: 'insensitive' } },
                { notes: { contains: filters.query, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.participantUserId
          ? {
              participants: {
                some: { userId: filters.participantUserId },
              },
            }
          : {}),
        ...(filters.fromDate || filters.toDate
          ? {
              expenseDate: {
                ...(filters.fromDate
                  ? { gte: new Date(filters.fromDate) }
                  : {}),
                ...(filters.toDate ? { lte: new Date(filters.toDate) } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ expenseDate: 'desc' }, { id: 'desc' }],
      include: {
        createdBy: {
          select: { id: true, email: true, username: true },
        },
        participants: {
          include: {
            user: {
              select: { id: true, email: true, username: true },
            },
          },
        },
      },
    });
  }

  async findOne(groupId: number, expenseId: number, userId: number) {
    await this.groupAccessService.ensureMember(groupId, userId);

    const expense = await this.prisma.expense.findFirst({
      where: {
        id: expenseId,
        groupId,
      },
      include: {
        createdBy: {
          select: { id: true, email: true, username: true },
        },
        participants: {
          include: {
            user: { select: { id: true, email: true, username: true } },
          },
        },
        items: {
          include: {
            participants: {
              include: {
                user: { select: { id: true, email: true, username: true } },
              },
            },
          },
        },
      },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    return expense;
  }

  async update(
    groupId: number,
    expenseId: number,
    userId: number,
    dto: UpdateExpenseDto,
  ) {
    const existingExpense = await this.findOne(groupId, expenseId, userId);

    if (existingExpense.createdById !== userId) {
      throw new ForbiddenException('Only expense creator can edit expense');
    }

    const data: Prisma.ExpenseUpdateInput = {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.totalAmount !== undefined
        ? { totalAmount: new Prisma.Decimal(dto.totalAmount) }
        : {}),
      ...(dto.currency !== undefined
        ? { currency: dto.currency.toUpperCase() }
        : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      ...(dto.attachmentUrl !== undefined
        ? { attachmentUrl: dto.attachmentUrl }
        : {}),
      ...(dto.expenseDate !== undefined
        ? { expenseDate: new Date(dto.expenseDate) }
        : {}),
      ...(dto.isRecurring !== undefined
        ? { isRecurring: dto.isRecurring }
        : {}),
      ...(dto.recurringRule !== undefined
        ? { recurringRule: dto.recurringRule }
        : {}),
    };

    const updatedExpense = await this.prisma.expense.update({
      where: { id: expenseId },
      data,
      include: {
        participants: {
          include: {
            user: { select: { id: true, email: true, username: true } },
          },
        },
      },
    });

    await this.activityService.log({
      groupId,
      actorId: userId,
      action: 'EXPENSE_UPDATED',
      entityType: 'Expense',
      entityId: expenseId,
      metadata: {
        updatedFields: Object.keys(dto),
      },
    });

    return updatedExpense;
  }

  async remove(groupId: number, expenseId: number, userId: number) {
    const existingExpense = await this.findOne(groupId, expenseId, userId);
    if (existingExpense.createdById !== userId) {
      throw new ForbiddenException('Only expense creator can delete expense');
    }

    const deletedExpense = await this.prisma.expense.update({
      where: { id: expenseId },
      data: {
        status: ExpenseStatus.DELETED,
      },
    });

    await this.activityService.log({
      groupId,
      actorId: userId,
      action: 'EXPENSE_DELETED',
      entityType: 'Expense',
      entityId: expenseId,
    });

    return deletedExpense;
  }

  async getGroupBalances(groupId: number, userId: number) {
    await this.groupAccessService.ensureMember(groupId, userId);

    const activeExpenses = await this.prisma.expense.findMany({
      where: {
        groupId,
        status: ExpenseStatus.ACTIVE,
      },
      include: {
        participants: true,
      },
    });

    const settlements = await this.prisma.settlement.findMany({
      where: {
        groupId,
        status: SettlementStatus.COMPLETED,
      },
    });

    const perPerson = new Map<
      number,
      {
        paidCents: number;
        owedCents: number;
      }
    >();

    for (const expense of activeExpenses) {
      for (const participant of expense.participants) {
        const current = perPerson.get(participant.userId) ?? {
          paidCents: 0,
          owedCents: 0,
        };

        current.paidCents += this.toCents(Number(participant.paidAmount));
        current.owedCents += this.toCents(Number(participant.owedAmount));
        perPerson.set(participant.userId, current);
      }
    }

    for (const settlement of settlements) {
      const amountCents = this.toCents(Number(settlement.amount));

      const payerCurrent = perPerson.get(settlement.payerId) ?? {
        paidCents: 0,
        owedCents: 0,
      };
      payerCurrent.paidCents += amountCents;
      perPerson.set(settlement.payerId, payerCurrent);

      const receiverCurrent = perPerson.get(settlement.receiverId) ?? {
        paidCents: 0,
        owedCents: 0,
      };
      receiverCurrent.owedCents += amountCents;
      perPerson.set(settlement.receiverId, receiverCurrent);
    }

    const members = await this.prisma.groupMember.findMany({
      where: { groupId },
      include: {
        user: {
          select: { id: true, email: true, username: true },
        },
      },
    });

    const balances = members.map((member) => {
      const totals = perPerson.get(member.userId) ?? {
        paidCents: 0,
        owedCents: 0,
      };
      const netCents = totals.paidCents - totals.owedCents;
      return {
        user: member.user,
        paid: this.toAmount(totals.paidCents),
        owed: this.toAmount(totals.owedCents),
        net: this.toAmount(netCents),
      };
    });

    const simplifiedTransfers = this.simplifyDebts(
      balances.map((balance) => ({
        userId: balance.user.id,
        netCents: this.toCents(balance.net),
      })),
    );

    return {
      perPerson: balances,
      overallNet: this.toAmount(
        balances.reduce((sum, balance) => sum + this.toCents(balance.net), 0),
      ),
      simplifiedTransfers: simplifiedTransfers.map((transfer) => ({
        fromUserId: transfer.fromUserId,
        toUserId: transfer.toUserId,
        amount: this.toAmount(transfer.amountCents),
      })),
    };
  }

  private simplifyDebts(
    balances: Array<{
      userId: number;
      netCents: number;
    }>,
  ) {
    const creditors = balances
      .filter((balance) => balance.netCents > 0)
      .map((balance) => ({ ...balance }));
    const debtors = balances
      .filter((balance) => balance.netCents < 0)
      .map((balance) => ({
        userId: balance.userId,
        netCents: Math.abs(balance.netCents),
      }));

    const transfers: Array<{
      fromUserId: number;
      toUserId: number;
      amountCents: number;
    }> = [];

    let creditorIdx = 0;
    let debtorIdx = 0;
    while (creditorIdx < creditors.length && debtorIdx < debtors.length) {
      const creditor = creditors[creditorIdx];
      const debtor = debtors[debtorIdx];
      const settled = Math.min(creditor.netCents, debtor.netCents);

      if (settled > 0) {
        transfers.push({
          fromUserId: debtor.userId,
          toUserId: creditor.userId,
          amountCents: settled,
        });
      }

      creditor.netCents -= settled;
      debtor.netCents -= settled;

      if (creditor.netCents === 0) {
        creditorIdx += 1;
      }
      if (debtor.netCents === 0) {
        debtorIdx += 1;
      }
    }

    return transfers;
  }

  async settleUp(
    groupId: number,
    payerId: number,
    receiverId: number,
    actorId: number,
    dto: CreateSettlementDto,
  ) {
    await this.groupAccessService.ensureMember(groupId, actorId);
    await this.groupAccessService.ensureMember(groupId, payerId);
    await this.groupAccessService.ensureMember(groupId, receiverId);

    if (payerId === receiverId) {
      throw new BadRequestException('Payer and receiver cannot be same');
    }

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const settlement = await this.prisma.settlement.create({
      data: {
        groupId,
        payerId,
        receiverId,
        amount: new Prisma.Decimal(dto.amount),
        currency: this.normalizeCurrency(dto.currency, group.defaultCurrency),
        note: dto.note,
      },
      include: {
        payer: {
          select: { id: true, email: true, username: true },
        },
        receiver: {
          select: { id: true, email: true, username: true },
        },
      },
    });

    await this.activityService.log({
      groupId,
      actorId,
      action: 'SETTLEMENT_ADDED',
      entityType: 'Settlement',
      entityId: settlement.id,
      metadata: {
        payerId,
        receiverId,
        amount: settlement.amount.toString(),
      },
    });

    return settlement;
  }

  async listSettlements(groupId: number, userId: number) {
    await this.groupAccessService.ensureMember(groupId, userId);
    return this.prisma.settlement.findMany({
      where: { groupId },
      orderBy: { settledAt: 'desc' },
      include: {
        payer: {
          select: { id: true, email: true, username: true },
        },
        receiver: {
          select: { id: true, email: true, username: true },
        },
      },
    });
  }

  async saveSplitRule(userId: number, dto: CreateSplitRuleDto) {
    if (dto.groupId) {
      await this.groupAccessService.ensureMember(dto.groupId, userId);
    }

    return this.prisma.savedSplitRule.create({
      data: {
        userId,
        groupId: dto.groupId,
        name: dto.name,
        splitType: dto.splitType,
        config: dto.config as Prisma.InputJsonValue,
      },
    });
  }

  async listSplitRules(userId: number, groupId?: number) {
    if (groupId) {
      await this.groupAccessService.ensureMember(groupId, userId);
    }

    return this.prisma.savedSplitRule.findMany({
      where: {
        userId,
        ...(groupId ? { OR: [{ groupId }, { groupId: null }] } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async equalizeForNewMember(
    groupId: number,
    userId: number,
    memberId: number,
  ) {
    await this.groupAccessService.ensureAdmin(groupId, userId);
    await this.groupAccessService.ensureMember(groupId, memberId);

    const latestExpenses = await this.prisma.expense.findMany({
      where: {
        groupId,
        status: ExpenseStatus.ACTIVE,
      },
      include: {
        participants: true,
      },
      orderBy: {
        expenseDate: 'desc',
      },
      take: 50,
    });

    const updates = [] as Array<{ expenseId: number; addedOwedAmount: number }>;

    for (const expense of latestExpenses) {
      const alreadyParticipant = expense.participants.some(
        (participant) => participant.userId === memberId,
      );
      if (alreadyParticipant || expense.participants.length === 0) {
        continue;
      }

      const newSplit = this.distributeEvenly(
        this.toCents(Number(expense.totalAmount)),
        [
          ...expense.participants.map((participant) => participant.userId),
          memberId,
        ],
      );

      const newMemberEntry = newSplit.find(
        (entry) => entry.userId === memberId,
      );
      if (!newMemberEntry) {
        continue;
      }

      await this.prisma.expenseParticipant.create({
        data: {
          expenseId: expense.id,
          userId: memberId,
          owedAmount: new Prisma.Decimal(
            this.toAmount(newMemberEntry.amountCents),
          ),
          paidAmount: new Prisma.Decimal(0),
          metadata: {
            equalizedAt: new Date().toISOString(),
          },
        },
      });

      updates.push({
        expenseId: expense.id,
        addedOwedAmount: this.toAmount(newMemberEntry.amountCents),
      });
    }

    await this.activityService.log({
      groupId,
      actorId: userId,
      action: 'EQUALIZATION_EXECUTED',
      metadata: {
        memberId,
        expensesTouched: updates.length,
      },
    });

    return {
      memberId,
      expensesUpdated: updates,
    };
  }
}
