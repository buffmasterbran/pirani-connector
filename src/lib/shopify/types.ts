import { Prisma } from '@prisma/client'

export type FlattenedOrderLine = Omit<Prisma.OrderLineUncheckedCreateInput, 'id'>
