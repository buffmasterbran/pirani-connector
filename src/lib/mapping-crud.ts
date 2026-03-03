import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api-helpers'

/**
 * Generic GET handler for mapping routes.
 * Fetches all records from the given Prisma model.
 */
export async function getMappings(
  prismaModel: any,
  modelName: string,
  options?: { orderBy?: any; where?: any }
): Promise<NextResponse> {
  try {
    const mappings = await prismaModel.findMany({
      where: options?.where,
      orderBy: options?.orderBy ?? { id: 'asc' },
    })
    return NextResponse.json({ success: true, data: mappings })
  } catch (error) {
    return handleApiError(error, `GET ${modelName}`)
  }
}

/**
 * Generic DELETE handler for mapping routes.
 * Deletes a single record by numeric id.
 */
export async function deleteMapping(
  prismaModel: any,
  id: number,
  modelName: string
): Promise<NextResponse> {
  try {
    await prismaModel.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, `DELETE ${modelName}`)
  }
}

/**
 * Generic batch upsert for mapping records.
 *
 * Handles the temp-id / numeric-id pattern shared by several mapping routes:
 *   - id starts with "temp-" --> create a new record
 *   - id is numeric          --> update the existing record
 *
 * @param prismaModel   The Prisma delegate (e.g. prisma.paymentMethodMapping)
 * @param mappings      The array sent by the client
 * @param dataExtractor Pulls the create/update data object out of each mapping entry.
 *                      Receives the raw mapping object; should return the Prisma `data` payload.
 * @param modelName     Human-readable name used in error messages
 * @param validator     Optional per-mapping validation. Return `true` to process, `false` to skip.
 */
export async function upsertMappings(
  prismaModel: any,
  mappings: any[],
  dataExtractor: (mapping: any) => any,
  modelName: string,
  validator?: (mapping: any) => boolean
): Promise<NextResponse> {
  try {
    if (!Array.isArray(mappings)) {
      return NextResponse.json(
        { success: false, error: 'mappings must be an array' },
        { status: 400 }
      )
    }

    const results: any[] = []

    for (const mapping of mappings) {
      if (validator && !validator(mapping)) {
        console.warn(`[${modelName}] Skipping invalid mapping:`, mapping)
        continue
      }

      const { id } = mapping
      const data = dataExtractor(mapping)

      if (id && id.toString().startsWith('temp-')) {
        // Create new record
        const created = await prismaModel.create({ data })
        results.push({ oldId: id, newId: created.id, ...created })
      } else if (id) {
        const numericId = Number(id)
        if (isNaN(numericId)) {
          console.warn(`[${modelName}] Skipping mapping with invalid id: ${id}`)
          continue
        }
        // Update existing record
        const updated = await prismaModel.update({
          where: { id: numericId },
          data,
        })
        results.push(updated)
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    return handleApiError(error, `PUT ${modelName}`)
  }
}
