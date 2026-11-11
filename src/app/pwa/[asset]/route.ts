import { pwaAsset } from '@/lib/pwa-assets';
export async function GET(_:Request,{params}:{params:Promise<{asset:string}>}) {
  return pwaAsset((await params).asset);
}
