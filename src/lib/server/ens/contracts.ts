// ENSv2 on Sepolia, from contracts-v2 at 07e55a05. Only the entry point, helper, factory and implementations are fixed;
// every registry and resolver is found at runtime, because ENS redeploys Sepolia often.
import { parseAbi } from "viem";

export const UNIVERSAL_RESOLVER = "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe"; // same on mainnet and Sepolia
export const UNIVERSAL_HELPER = "0xd453e5bdb62cc3bea84341b1e306319c8ffd7dfe";
export const VERIFIABLE_FACTORY = "0xda70306c98e97ece36f997a21368e53298572991";
export const USER_REGISTRY_IMPL = "0x9bd8a88719068d09ecee662f36c0e3856708366a";
export const PERMISSIONED_RESOLVER_IMPL = "0x115eb53f0c60696633855f90b138178fb40b2b2c";

// A role is one nybble; its admin role sits 128 bits higher.
const bit = (n: number) => BigInt(1) << BigInt(n);
export const admin = (role: bigint) => role << BigInt(128);
export const withAdmin = (...roles: bigint[]) => roles.reduce((bits, role) => bits | role | admin(role), BigInt(0));

// RegistryRolesLib
export const REG = {
  REGISTRAR: bit(0),
  SET_PARENT: bit(8),
  UNREGISTER: bit(12),
  RENEW: bit(16),
  SET_SUBREGISTRY: bit(20),
  SET_RESOLVER: bit(24),
  CAN_TRANSFER_ADMIN: bit(28 + 128),
  SET_URI: bit(36),
};

// PermissionedResolverLib
export const RES = {
  SET_ADDRESS: bit(0),
  SET_TEXT: bit(4),
};

export const ALL_ROLES = BigInt(`0x${"1".repeat(64)}`);

const eacErrors = [
  "error EACUnauthorizedAccountRoles(uint256 resource, uint256 roleBitmap, address account)",
  "error EACCannotGrantRoles(uint256 resource, uint256 roleBitmap, address account)",
  "error EACCannotRevokeRoles(uint256 resource, uint256 roleBitmap, address account)",
  "error EACMaxAssignees(uint256 resource, uint256 role)",
  "error EACInvalidAccount()",
] as const;

export const universalResolverAbi = parseAbi([
  "function ROOT_REGISTRY() view returns (address)",
  "function findResolver(bytes name) view returns (address resolver, bytes32 node, uint256 offset)",
]);

export const helperAbi = parseAbi([
  "function ROOT_REGISTRY() view returns (address)",
  "function findCanonicalRegistry(bytes name) view returns (address)",
]);

export const factoryAbi = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address)",
  "function predictProxyAddress(address deployer, uint256 salt) view returns (address)",
]);

export const registryAbi = parseAbi([
  "function initialize((address account, uint256 roleBitmap)[] grants)",
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
  "function setSubregistry(uint256 anyId, address registry)",
  "function setParent(address parent, string label)",
  "function revokeRootRoles(uint256 roleBitmap, address account) returns (bool)",
  "function getSubregistry(string label) view returns (address)",
  "function getParent() view returns (address parent, string label)",
  "function findOwner(string label) view returns (address)",
  "function findExpiry(string label) view returns (uint64)",
  "function isEmancipated() view returns (bool)",
  "function roles(uint256 anyId, address account) view returns (uint256)",
  "error LabelAlreadyRegistered(string label)",
  "error LabelAlreadyReserved(string label)",
  "error LabelExpired(uint256 tokenId)",
  "error CannotSetPastExpiry(uint64 expiry)",
  "error InvalidOwner()",
  "error ERC1155InvalidReceiver(address receiver)",
  ...eacErrors,
]);

export const resolverAbi = parseAbi([
  "function initialize((address account, uint256 roleBitmap)[] grants, bytes[] calls)",
  "function setText(bytes name, string key, string value)",
  "function setAddress(bytes name, uint256 coinType, bytes addressBytes)",
  "function grantSetterRoles(bytes setter, address account) returns (bool)",
  "function revokeRootRoles(uint256 roleBitmap, address account) returns (bool)",
  "function multicall(bytes[] calls) returns (bytes[])",
  "function roles(uint256 resource, address account) view returns (uint256)",
  "error InvalidRecord()",
  "error UnsupportedResolverProfile(bytes4 selector)",
  "error InvalidEVMAddress(bytes addressBytes)",
  ...eacErrors,
]);
