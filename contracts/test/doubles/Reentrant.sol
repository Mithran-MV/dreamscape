// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {TestUSDC} from "./TestUSDC.sol";
import {IEditionsRegistry} from "../../src/interfaces/IEditionsRegistry.sol";

/// @notice One-shot hook: once armed, the next callback makes `data` call into `target`
/// and bubbles up any revert. Used to try re-entering NightMarket.
abstract contract Hook {
    address private _target;
    bytes private _data;

    function arm(address target, bytes calldata data) external {
        _target = target;
        _data = data;
    }

    function _fire() internal {
        address target = _target;
        if (target == address(0)) return;
        _target = address(0);
        (bool ok, bytes memory ret) = target.call(_data);
        if (!ok) {
            assembly ("memory-safe") {
                revert(add(ret, 0x20), mload(ret))
            }
        }
    }
}

/// @notice A USDC that calls back into the market on transfer and transferFrom.
contract ReentrantUSDC is TestUSDC, Hook {
    function transfer(address to, uint256 amount) public override returns (bool) {
        _fire();
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        _fire();
        return super.transferFrom(from, to, amount);
    }
}

/// @notice An editions registry that calls back into the market while minting.
contract ReentrantRegistry is IEditionsRegistry, Hook {
    uint256 private _next;

    function register(string calldata, address, address, address, uint256, uint64) external returns (uint256) {
        _fire();
        return ++_next;
    }
}
