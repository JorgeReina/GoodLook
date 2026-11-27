import { test as base } from '@playwright/test';
import { startIsolatedProduct } from './isolated-product.mjs';
import { stubCatalogBusinessGet } from './product-data';

type Product = {
  origin: string;
  url: string;
  outputDir: string;
  setOutputDir(path: string): void;
  close(): Promise<void>;
};

export const test = base.extend<{ catalogBusiness: void }, { product: Product }>({
  product: [async ({}, use) => {
    const product: Product = await startIsolatedProduct();
    try {
      await use(product);
    } finally {
      await product.close();
    }
  }, { scope: 'worker', timeout: 180_000 }],
  catalogBusiness: [async ({ context, product }, use) => {
    await stubCatalogBusinessGet(context, product.origin);
    await use();
  }, { auto: true }],
});

export { expect } from '@playwright/test';
