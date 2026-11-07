import type { RouteObject } from 'react-router';
import { HomePage } from '@/features/home';

export const routes: RouteObject[] = [{ path: '/', element: <HomePage /> }];
