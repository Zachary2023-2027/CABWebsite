import { defineConfig } from 'vitest/config';

/* The root site's model — catalog data, layout, pricing and formatting — is
   plain ESM with no DOM in it, the same split the viewer under app/ keeps.
   js/app.js is the only module that touches the document and is not covered
   here; everything it renders from is. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['js/__tests__/**/*.test.js'],
  },
});
