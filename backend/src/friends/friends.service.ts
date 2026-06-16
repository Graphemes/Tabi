import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AddContactDto } from './dto/add-contact.dto';
import { DiscoverUsersDto } from './dto/discover-users.dto';

const userSelect = {
  id: true,
  email: true,
  username: true,
  name: true,
  phone: true,
};

@Injectable()
export class FriendsService {
  constructor(private readonly prisma: PrismaService) {}

  async addContact(userId: number, dto: AddContactDto) {
    const results: Array<{ phone: string; status: string; error?: string }> =
      [];

    for (const item of dto.contacts) {
      try {
        const target = await this.prisma.user.findUnique({
          where: { phone: item.phone },
          select: { id: true },
        });

        if (!target) {
          results.push({
            phone: item.phone,
            status: 'error',
            error: 'No user found with this phone number',
          });
          continue;
        }

        if (target.id === userId) {
          results.push({
            phone: item.phone,
            status: 'error',
            error: 'Cannot add yourself as a contact',
          });
          continue;
        }

        await this.prisma.contact.upsert({
          where: {
            userId_contactId: {
              userId,
              contactId: target.id,
            },
          },
          create: {
            userId,
            contactId: target.id,
            name: item.name || undefined,
          },
          update: {
            ...(item.name !== undefined ? { name: item.name } : {}),
          },
        });

        results.push({
          phone: item.phone,
          status: 'success',
        });
      } catch (err: any) {
        results.push({
          phone: item.phone,
          status: 'error',
          error: err.message || 'Failed to add contact',
        });
      }
    }

    return { results };
  }

  async listContacts(userId: number) {
    const contacts = await this.prisma.contact.findMany({
      where: { userId },
      include: { contact: { select: userSelect } },
      orderBy: { createdAt: 'desc' },
    });

    return contacts.map((c) => ({
      contactId: c.id,
      name: c.name || undefined,
      user: c.contact,
      createdAt: c.createdAt,
    }));
  }

  async removeContact(userId: number, contactId: number) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
    });

    if (!contact || contact.userId !== userId) {
      throw new Error('Contact not found');
    }

    await this.prisma.contact.delete({ where: { id: contactId } });

    return { removed: true, contactId };
  }

  async discoverUsers(userId: number, query: DiscoverUsersDto) {
    const userContactIds = new Set<number>();
    const contacts = await this.prisma.contact.findMany({
      where: { userId },
      select: { contactId: true, name: true },
    });
    for (const c of contacts) {
      userContactIds.add(c.contactId);
    }

    const contactMap = new Map<number, string | null>();
    for (const c of contacts) {
      contactMap.set(c.contactId, c.name);
    }

    const users = await this.prisma.user.findMany({
      where: {
        id: { not: userId },
        ...(query.query
          ? {
              OR: [
                { name: { contains: query.query, mode: 'insensitive' } },
                { username: { contains: query.query, mode: 'insensitive' } },
                { phone: { contains: query.query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: userSelect,
      orderBy: { username: 'asc' },
      take: 50,
    });

    return users.map((user) => ({
      ...user,
      isContact: userContactIds.has(user.id),
      contactName: contactMap.get(user.id) || null,
    }));
  }
}
