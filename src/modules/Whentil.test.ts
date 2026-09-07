import Whentil from "./Whentil.ts";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const originalConsoleError = console.error;
console.error = () => {};

try {
  let whenCalls = 0;
  Whentil.When(
    () => true,
    () => {
      whenCalls += 1;
      throw new Error("expected test failure");
    }
  );
  await wait(70);
  if (whenCalls !== 1) throw new Error("When did not consume a failed callback execution");

  let untilCalls = 0;
  Whentil.Until(
    () => false,
    () => {
      untilCalls += 1;
      throw new Error("expected test failure");
    },
    2
  );
  await wait(90);
  if (untilCalls !== 2) {
    throw new Error("Until did not stop after maxRepeats when callbacks failed");
  }
} finally {
  console.error = originalConsoleError;
}

console.log("Whentil tests passed");
