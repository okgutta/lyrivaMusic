import type { Brand } from "../types/Brand.d.ts";

const packagesUrl = "https://pkgs.spikerko.org";

// deno-lint-ignore no-explicit-any
export type Package = Brand<any, "Package">;

export type PackageUrl = Brand<string, "PackageUrl">;

const packages = new Map<PackageUrl, Package>();
const currentlyLoadingPackages = new Set<PackageUrl>();

export type PackageFileType = "js" | "ts" | "wasm" | "mjs";

const BuildImportUrl = (
  name: string,
  version: string,
  fileType: PackageFileType = "js"
): PackageUrl => {
  return `${packagesUrl}/${name}/${name}@${version}.${fileType}` as PackageUrl;
};

const LoadPackage = async (importUrl: PackageUrl): Promise<Package | Error | undefined> => {
  try {
    if (packages.has(importUrl)) return undefined;
    currentlyLoadingPackages.add(importUrl);
    // 注意：从 pkgs.spikerko.org 动态 import 远程包并全局缓存。这是 Spicetify 生态
    // 常见做法，但存在供应链风险——若 CDN 被攻破/域名过期，注入的 JS 拥有完整权限。
    // 完整加固需要 SRI/哈希校验（当前按平台惯例接受该风险）。
    const pkg = await import(importUrl);
    if (pkg === undefined) return undefined;
    packages.set(importUrl, pkg);
    return pkg as Package;
  } catch (error: any) {
    throw new Error(`SpicyLyrics [LoadPackage] ${error?.message ?? "An Error Occured"}`);
  } finally {
    // 无论成败都释放 in-flight 标记，避免失败后悬挂
    currentlyLoadingPackages.delete(importUrl);
  }
};

export const RetrievePackage = async (
  name: string,
  version: string,
  fileType: PackageFileType = "js"
): Promise<Package | Error | undefined> => {
  try {
    const importUrl = BuildImportUrl(name, version, fileType);
    if (packages.has(importUrl)) {
      return packages.get(importUrl) as Package;
    }
    const pkg = await LoadPackage(importUrl);
    if (pkg === undefined) return undefined;
    return pkg as Package;
  } catch (error: any) {
    throw new Error(`SpicyLyrics [RetrievePackage] ${error?.message ?? "An Error Occured"}`);
  }
};
