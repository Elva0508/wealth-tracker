import { defineConfig } from 'vitest/config';

// 只測試共用計算模組：純函式，不需要瀏覽器或資料庫
export default defineConfig({
  test: {
    include: ['supabase/functions/_shared/core/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
