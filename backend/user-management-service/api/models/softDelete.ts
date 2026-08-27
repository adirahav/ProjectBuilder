/**
 * Shared schema helpers. A rule that must be repeated in every service function
 * is a rule that will eventually be forgotten in one of them — so soft-delete
 * filtering and `_id`/secret stripping live in the schema, not in the callers
 * (mongoose-models-layer skill).
 */

/** Applied as a pre-hook on every soft-deleted model (here: `Admin`). */
export function excludeDeleted(this: any, next: () => void): void {
  const filter = this.getFilter ? this.getFilter() : this._conditions
  if (filter.deletedAt === undefined) {
    this.where({ deletedAt: null })
  }
  next()
}

/** Maps `uuid` → `id` and drops the internal `_id`/`__v` from every response. */
export function publicIdTransform(_doc: unknown, ret: Record<string, any>): Record<string, any> {
  ret.id = ret.uuid
  delete ret._id
  delete ret.uuid
  delete ret.__v
  return ret
}
