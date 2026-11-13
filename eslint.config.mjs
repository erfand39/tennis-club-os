import { defineConfig } from 'eslint/config';
import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

export default defineConfig([...coreWebVitals, ...typescript]);
