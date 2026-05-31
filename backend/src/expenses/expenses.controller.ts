import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ListExpensesDto } from './dto/list-expenses.dto';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { CreateSplitRuleDto } from './dto/create-split-rule.dto';

@Controller('groups/:groupId')
@UseGuards(JwtAuthGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post('expenses')
  createExpense(
    @Param('groupId') groupId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.expensesService.create(Number(groupId), user.userId, dto);
  }

  @Get('expenses')
  listExpenses(
    @Param('groupId') groupId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: ListExpensesDto,
  ) {
    return this.expensesService.list(Number(groupId), user.userId, query);
  }

  @Get('expenses/:expenseId')
  findExpense(
    @Param('groupId') groupId: string,
    @Param('expenseId') expenseId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.expensesService.findOne(
      Number(groupId),
      Number(expenseId),
      user.userId,
    );
  }

  @Patch('expenses/:expenseId')
  updateExpense(
    @Param('groupId') groupId: string,
    @Param('expenseId') expenseId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expensesService.update(
      Number(groupId),
      Number(expenseId),
      user.userId,
      dto,
    );
  }

  @Delete('expenses/:expenseId')
  removeExpense(
    @Param('groupId') groupId: string,
    @Param('expenseId') expenseId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.expensesService.remove(
      Number(groupId),
      Number(expenseId),
      user.userId,
    );
  }

  @Get('balances')
  getBalances(@Param('groupId') groupId: string, @CurrentUser() user: AuthUser) {
    return this.expensesService.getGroupBalances(Number(groupId), user.userId);
  }

  @Post('settlements/:receiverId')
  createSettlement(
    @Param('groupId') groupId: string,
    @Param('receiverId') receiverId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSettlementDto,
  ) {
    return this.expensesService.settleUp(
      Number(groupId),
      user.userId,
      Number(receiverId),
      user.userId,
      dto,
    );
  }

  @Get('settlements')
  listSettlements(
    @Param('groupId') groupId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.expensesService.listSettlements(Number(groupId), user.userId);
  }

  @Post('split-rules')
  saveSplitRule(@CurrentUser() user: AuthUser, @Body() dto: CreateSplitRuleDto) {
    return this.expensesService.saveSplitRule(user.userId, dto);
  }

  @Get('split-rules')
  listSplitRules(
    @CurrentUser() user: AuthUser,
    @Query('groupId') groupId?: string,
  ) {
    return this.expensesService.listSplitRules(
      user.userId,
      groupId ? Number(groupId) : undefined,
    );
  }

  @Post('equalize/:memberId')
  equalizeForNewMember(
    @Param('groupId') groupId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.expensesService.equalizeForNewMember(
      Number(groupId),
      user.userId,
      Number(memberId),
    );
  }
}
