import { render } from "@testing-library/react";
import { SWRConfig } from "swr";
import { cache } from "swr/_internal";

export function sleep(time: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, time));
}

export const createResponse = <T,>(
  response: T,
  { delay } = { delay: 10 }
): Promise<T> =>
  new Promise((resolve, reject) =>
    setTimeout(() => {
      if (response instanceof Error) {
        reject(response);
      } else {
        resolve(response);
      }
    }, delay)
  );

export const createKey = () => Math.random.toString().slice(2, 10);

export const renderWithConfig = (
  element: React.ReactElement,
  config?: Parameters<typeof SWRConfig>[0]["value"]
): ReturnType<typeof render> => {
  const provider = () => new Map();
  const TestSWRConfig = ({ children }: { children: React.ReactNode }) => (
    <SWRConfig value={{ provider, ...config }}>{children}</SWRConfig>
  );
  return render(element, { wrapper: TestSWRConfig });
};

export const clearCache = () => {
  for (let key of cache.keys()) {
    cache.delete(key);
  }
};
