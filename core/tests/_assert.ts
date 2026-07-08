/**
 * Minimal assert helpers — no external deps.
 */

export function assert(condition: boolean, msg?: string): void {
  if (!condition) {
    throw new Error(msg ?? "assert failed");
  }
}

export function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(
      msg ??
        `assertEquals failed:\n  actual:   ${actualStr}\n  expected: ${expectedStr}`,
    );
  }
}

export function assertStringIncludes(
  actual: string,
  expected: string,
  msg?: string,
): void {
  if (!actual.includes(expected)) {
    throw new Error(
      msg ??
        `assertStringIncludes failed: "${expected}" not found in "${
          actual.slice(0, 200)
        }"`,
    );
  }
}

export function assertExists<T>(value: T, msg?: string): void {
  if (value === null || value === undefined) {
    throw new Error(msg ?? `assertExists failed: value is ${value}`);
  }
}

export async function assertRejects(
  fn: () => Promise<unknown>,
  errorClass?: typeof Error,
  msgIncludes?: string,
): Promise<void> {
  try {
    await fn();
    throw new Error("assertRejects: function did not throw");
  } catch (e) {
    if (
      e instanceof Error &&
      e.message === "assertRejects: function did not throw"
    ) {
      throw e;
    }
    if (errorClass && !(e instanceof errorClass)) {
      throw new Error(
        `assertRejects: expected ${errorClass.name} but got ${
          (e as Error).constructor?.name
        }`,
      );
    }
    if (msgIncludes && !(e as Error).message?.includes(msgIncludes)) {
      throw new Error(
        `assertRejects: error message "${
          (e as Error).message
        }" does not include "${msgIncludes}"`,
      );
    }
  }
}
