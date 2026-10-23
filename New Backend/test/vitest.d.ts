// Values shared from test/helpers/global-setup.js to the test files.
import "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    mongoUri: string;
  }
}
