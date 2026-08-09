/**
 * TanStack DB collection registry.
 *
 * Empty at bootstrap (Story 1.1) — collections are added by the stories that
 * first need them (e.g. Room/Piece in Epic 2, Cluster in Epic 3). Every
 * collection defined here must sync exclusively through an Electric Shape
 * scoped to a Room (Architecture AD-1) — never polling, never a parallel
 * sync channel.
 */
export {};
