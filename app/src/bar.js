/* ===========================================================================
   Breakfast bar figures.

   Their own file because two sides of the app need them and neither owns
   them. The model needs them to work out how many brackets are on the order
   list; the checks need them to say whether you can actually sit at the
   thing. Putting them in either one means the other imports it for a table of
   numbers, or worse, keeps a second copy that drifts.

   VERIFY BEFORE BUILDING. Every figure here depends on who is sitting, what
   stool they are on, and what the top is made of. Stone and laminate carry
   themselves over very different spans, and the bracket you actually buy
   comes with its own spacing. None of these is a number this app is in a
   position to assert: they are starting points, they are all typed settings
   on the Checks screen, and the drawing is measured against yours.
   =========================================================================== */

export const BAR_RULES = Object.freeze({
  /* How far the top has to reach past the carcass before knees fit under it.
     Below this you have a wide bench, not somewhere to sit. */
  barKneeDepth: 300,
  /* Elbow room per stool, which is what decides how many fit. */
  barSeatWidth: 600,
  /* How far a top of this material carries itself. Past this it needs a
     bracket, a leg or a corbel. */
  barMaxUnsupported: 300,
  /* How far apart the supports go once it needs them. */
  barBracketSpacing: 900,
  /* Behind the bar edge, so a stool can be pulled out and sat on without
     backing into whatever is behind it. */
  barStoolSpace: 900,
});
