// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Deploy NightMarket to Ethereum Sepolia (5% to the commons) and make the app server an operator.
// Run from contracts/:
//
//   USDC_ADDRESS=0x... COMMONS_ADDRESS=0x... SERVER_ADDRESS=0x... \
//   ~/.foundry/bin/forge script script/DeployMarket.s.sol:DeployMarket \
//     --rpc-url https://ethereum-sepolia-rpc.publicnode.com --private-key <DEPLOYER_KEY> --broadcast
//
// Drop --broadcast for a dry run. The deployer becomes the owner.
// After deploying, grant this contract ROLE_REGISTRAR on each dreamer's editions registry,
// and have the server bind each registry (bindRegistry) and vendor agent (bindAgent).

import {Script} from "forge-std/Script.sol";
import {NightMarket} from "../src/NightMarket.sol";

contract DeployMarket is Script {
    uint16 constant COMMONS_BPS = 500;

    function run() external returns (NightMarket market) {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address commons = vm.envAddress("COMMONS_ADDRESS");
        address server = vm.envAddress("SERVER_ADDRESS");

        vm.startBroadcast();
        market = new NightMarket(usdc, commons, COMMONS_BPS);
        market.setOperator(server, true);
        vm.stopBroadcast();
    }
}
