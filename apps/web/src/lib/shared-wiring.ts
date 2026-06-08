import type { ProjectStatus } from "@oc/shared";

/** Compile-time check that @oc/web can import from @oc/shared. */
export type WebSharedWiring = ProjectStatus;
