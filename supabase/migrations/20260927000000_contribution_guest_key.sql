-- Story 4.3: a Guest's contributions become claimable, so the column that
-- identifies them stops being readable.
--
-- `contribution.guest_participant_id` (Story 4.2, three days ago) holds the
-- raw id a Guest's browser generated. That column reaches **every client in
-- the Room, twice**: `fetchContributions` returns it, and Realtime
-- broadcasts the whole row on insert.
--
-- That was harmless while nothing acted on it. Story 4.3 makes it the key
-- that transfers ownership of a contribution to an account — so left as-is,
-- any Participant could read every Guest's id straight out of the history
-- they are already shown, and claim their pieces.
--
-- So the column holds a SHA-256 of the id instead. The hash is what gets
-- broadcast and displayed: stable, it groups one Guest's lines together, and
-- it is not reversible. Claiming requires the pre-image, which only that
-- Guest's own browser has.
alter table contribution rename column guest_participant_id to guest_key;

-- Existing rows are hashed in place rather than dropped.
--
-- The story that planned this migration assumed the column held nothing but
-- e2e rows and said to truncate. **It was wrong** — checking first found 45
-- genuine contributions in a real Room. Nothing needs to be lost: the
-- pre-image is right here in the column, and the browsers that produced it
-- still hold the same id, so a claim made tomorrow will match a row hashed
-- today.
--
-- `sha256()` and `encode()` are core Postgres (11+), so this needs no
-- extension. Hex, lowercase, of the UTF-8 bytes — exactly what
-- `crypto.createHash("sha256").update(id).digest("hex")` produces in the
-- Server Action, which is the only other place this hash is ever computed.
update contribution
set guest_key = encode(sha256(convert_to(guest_key, 'UTF8')), 'hex')
where guest_key is not null;

-- The index survives the rename; only its own name would still say
-- "participant id", which would be the one misleading thing left behind.
alter index contribution_guest_idx rename to contribution_guest_key_idx;
