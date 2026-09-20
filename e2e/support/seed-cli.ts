/**
 * Manual helpers for the seeding layer, before any browser is involved.
 *
 *   pnpm e2e:seed     seeds a smoke-shaped room and prints its URL, so the
 *                     room can be opened and played by hand — the only way
 *                     to know the fixtures produce a genuinely playable
 *                     puzzle rather than one that merely inserts cleanly.
 *   pnpm e2e:clean    deletes every `e2e-` room unconditionally.
 */
import { closePool } from "./db";
import { seedRoom, sweepSeededRooms } from "./seed";

async function main() {
  const command = process.argv[2] ?? "seed";

  if (command === "clean") {
    const deleted = await sweepSeededRooms(0);
    console.log(`Deleted ${deleted} seeded room(s).`);
    return;
  }

  if (command === "seed") {
    const room = await seedRoom({
      gridRows: 3,
      gridCols: 3,
      pieces: {
        // The smoke pair: true horizontal neighbours, both loose, parked far
        // enough apart that nothing is in contact at load time.
        "1,1": { at: { x: -250, y: 0 } },
        "1,2": { at: { x: 250, y: 0 } },
      },
    });
    console.log(`Seeded room: http://localhost:3100${room.path}`);
    console.log(`         (or http://localhost:3000${room.path} against your own dev server)`);
    console.log(`room_id:     ${room.roomId}`);
    console.log(`piece (1,1): ${room.pieceId(1, 1)}`);
    console.log(`piece (1,2): ${room.pieceId(1, 2)}`);
    console.log("\nDrag (1,1) so it sits one tile-width left of (1,2) — they should fuse.");
    console.log("Clean up afterwards with: pnpm e2e:clean");
    return;
  }

  throw new Error(`Unknown command "${command}". Use "seed" or "clean".`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closePool);
