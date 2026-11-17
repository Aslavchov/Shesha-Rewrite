/**
 * Where a key takes the focus in a grid of `count` items laid out in rows of
 * `columns`: left and right along the reading order, up and down by a row,
 * Home and End to the ends. Null when the key is not one of those; the same
 * index when there is nowhere further to go.
 */
export function gridTarget(
  key: string,
  index: number,
  count: number,
  columns: number,
): number | null {
  const last = count - 1
  switch (key) {
    case "ArrowRight":
      return Math.min(index + 1, last)
    case "ArrowLeft":
      return Math.max(index - 1, 0)
    case "ArrowDown":
      // Below a short last row there is nothing: its last item is the nearest.
      if (index + columns <= last) return index + columns
      return Math.floor(index / columns) < Math.floor(last / columns) ? last : index
    case "ArrowUp":
      return index - columns >= 0 ? index - columns : index
    case "Home":
      return 0
    case "End":
      return last
    default:
      return null
  }
}
