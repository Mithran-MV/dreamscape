// DreamscapeRegistry: the registry for every name under dream-scape.eth. The server deploys it and pays;
// mounting it is one transaction from the name's owner, which the server can't send.
import { encodeFunctionData, labelhash, zeroAddress, type Address } from "viem";
import { env } from "../env";
import { REG, UNIVERSAL_HELPER, USER_REGISTRY_IMPL, helperAbi, registryAbi, withAdmin } from "./contracts";
import { deployProxy, dns, findParent, mined, predictProxy, registrySalt, same, type Ens, type Reader, type Step, type Wallet } from "./client";

// Emancipated at birth: nobody holds a role that could take a name back, swap its resolver or upgrade the registry.
// The server keeps registrar and renew; its set-parent roles last one transaction.
function grants(owner: Address, server: Address) {
  return [
    { account: owner, roleBitmap: withAdmin(REG.REGISTRAR, REG.RENEW, REG.SET_URI, REG.SET_PARENT) },
    { account: server, roleBitmap: REG.REGISTRAR | REG.RENEW | withAdmin(REG.SET_PARENT) },
  ];
}

// Reads only: where the registry is (or will be), whether it's mounted, and the owner's mount transaction.
export async function planBootstrap(client: Reader, server: Address) {
  const parent = await findParent(client);
  const registry = await predictProxy(client, server, registrySalt(env.ensName()));
  const mount = {
    from: parent.owner,
    to: parent.registry,
    data: encodeFunctionData({ abi: registryAbi, functionName: "setSubregistry", args: [BigInt(labelhash(parent.label)), registry] }),
    value: "0",
    chainId: client.chain.id,
  };
  return { parent, registry, deployed: Boolean(await client.getCode({ address: registry })), mounted: same(parent.subregistry, registry), mount };
}

// Safe to rerun: each step is skipped once done. Returns the plan, now deployed, plus the transactions sent.
export async function bootstrapRegistry(ens: Ens) {
  const server = ens.server.account.address;
  const plan = await planBootstrap(ens.client, server);
  const { parent, registry } = plan;
  const steps: Step[] = [];

  const init = encodeFunctionData({ abi: registryAbi, functionName: "initialize", args: [grants(parent.owner, server)] });
  const deployed = await deployProxy(ens, "deploy DreamscapeRegistry", USER_REGISTRY_IMPL, registrySalt(env.ensName()), init);
  if (deployed.step) steps.push(deployed.step);

  const [currentParent, currentLabel] = await ens.client.readContract({ address: registry, abi: registryAbi, functionName: "getParent" });
  if (!same(currentParent, parent.registry) || currentLabel !== parent.label) {
    const hash = await ens.server.writeContract({ address: registry, abi: registryAbi, functionName: "setParent", args: [parent.registry, parent.label] });
    steps.push(await mined(ens.client, "setParent", hash));
  }
  const held = await ens.client.readContract({ address: registry, abi: registryAbi, functionName: "roles", args: [BigInt(0), server] });
  if (held & withAdmin(REG.SET_PARENT)) {
    const hash = await ens.server.writeContract({ address: registry, abi: registryAbi, functionName: "revokeRootRoles", args: [withAdmin(REG.SET_PARENT), server] });
    steps.push(await mined(ens.client, "drop the server's set-parent roles", hash));
  }
  return { ...plan, deployed: true, steps };
}

// Sends the mount from a wallet that holds the parent name. On a fork that's the impersonated owner.
export async function mountRegistry(ens: Ens, owner: Wallet) {
  const plan = await planBootstrap(ens.client, ens.server.account.address);
  if (plan.mounted) return undefined;
  if (!same(owner.account.address, plan.mount.from)) throw new Error(`Only ${plan.mount.from} can mount the registry.`);
  return mined(ens.client, "setSubregistry (owner)", await owner.sendTransaction({ to: plan.mount.to, data: plan.mount.data }));
}

// The mount is canonical when dream-scape.eth points at the registry and the registry points back.
export async function checkMount(client: Reader) {
  const registry = (await findParent(client)).subregistry;
  if (registry === zeroAddress) return { registry, canonical: false, emancipated: false };
  const [canonical, emancipated] = await Promise.all([
    client.readContract({ address: UNIVERSAL_HELPER, abi: helperAbi, functionName: "findCanonicalRegistry", args: [dns(env.ensName())] }),
    client.readContract({ address: registry, abi: registryAbi, functionName: "isEmancipated" }),
  ]);
  return { registry, canonical: same(canonical, registry), emancipated };
}
