import { connectDb, disconnectDb } from '../lib/db.js'
import { Tour } from '../models/Tour.model.js'
import { Bus } from '../models/Bus.model.js'
import { Seat } from '../models/Seat.model.js'
import { upsertDefaultBusType } from '../busType/busType.service.js'
import { buildSeatGrid, DEFAULT_LAYOUT } from './seatGrid.js'

/**
 * Idempotent bootstrap for local development.
 *
 * The default `busType` is reference data and is always upserted
 * (.rule/database-rules.md "Bootstrap"). The demo tour/bus/seats exist so the
 * passenger selector and seat map are testable end-to-end without waiting on
 * the Tab 4b admin CRUD ticket (plan 007, Open Question 1) — they are upserted
 * by name and never re-created if already present, so re-running the script
 * never duplicates data or resets a seat someone has already requested.
 */
async function seed() {
  await connectDb()

  await upsertDefaultBusType({
    rows: DEFAULT_LAYOUT.rows,
    doorRowPosition: DEFAULT_LAYOUT.doorRow,
    backRowSeatCount: DEFAULT_LAYOUT.backRowSeatCount,
  })
  console.log('[SEED] default busType upserted')

  const tourName = 'הגליל העליון'
  let tour = await Tour.findOne({ name: tourName })
  if (!tour) {
    tour = await Tour.create({
      name: tourName,
      date: new Date('2026-09-14'),
      endDate: new Date('2026-09-16'),
      description: 'טיול דו-יומי בגליל העליון',
    })
    console.log('[SEED] tour created')
  }

  const busName = 'אוטובוס 1'
  let bus = await Bus.findOne({ tourId: tour._id, name: busName })
  if (!bus) {
    const grid = buildSeatGrid(DEFAULT_LAYOUT)
    bus = await Bus.create({
      tourId: tour._id,
      name: busName,
      seatCount: grid.length,
      seatLayout: {
        aisleAfterColumn: DEFAULT_LAYOUT.aisleAfterColumn,
        doorRow: DEFAULT_LAYOUT.doorRow,
        backRow: DEFAULT_LAYOUT.rows,
      },
      pickupPoints: [
        { name: 'תחנה מרכזית תל אביב', order: 1 },
        { name: 'צומת גלילות', order: 2 },
        { name: 'חיפה — חוף הכרמל', order: 3 },
      ],
    })
    await Seat.insertMany(grid.map((position) => ({ busId: bus!._id, position })))
    console.log(`[SEED] bus created with ${grid.length} seats`)
  }

  console.log('[SEED] done')
  await disconnectDb()
}

seed().catch(async (err) => {
  console.log('[SEED] failed:', (err as Error).message)
  await disconnectDb()
  process.exit(1)
})
