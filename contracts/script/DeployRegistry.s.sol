// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Deploy DreamRegistry to 0G Galileo (chain 16602) and make the app server a writer.
// Run from contracts/:
//
//   SERVER_ADDRESS=0x... ~/.foundry/bin/forge script script/DeployRegistry.s.sol:DeployRegistry \
//     --rpc-url https://evmrpc-testnet.0g.ai --private-key <DEPLOYER_KEY> --broadcast
//
// Drop --broadcast for a dry run. The deployer becomes the owner.

import {Script} from "forge-std/Script.sol";
import {DreamRegistry} from "../src/DreamRegistry.sol";

contract DeployRegistry is Script {
    function run() external returns (DreamRegistry registry) {
        address server = vm.envAddress("SERVER_ADDRESS");

        vm.startBroadcast();
        registry = new DreamRegistry();
        registry.setWriter(server, true);
        vm.stopBroadcast();
    }
}
