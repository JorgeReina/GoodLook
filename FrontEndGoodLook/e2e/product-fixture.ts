import { test as base } from '@playwright/test';
import { startIsolatedProduct } from './isolated-product.mjs';

type Product = {
  origin: string;
  url: string;
  outputDir: string;
  setOutputDir(path: string): void;
  close(): Promise<void>;
};

export const test = base.extend<{}, { product: Product }>({
  product: [async ({}, use) => {
    const product: Product = await startIsolatedProduct();
    try {
      await use(product);
    } finally {
      await product.close();
    }
  }, { scope: 'worker', timeout: 180_000 }],
});

export { expect } from '@playwright/test';
