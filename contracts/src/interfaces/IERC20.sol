// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice The slice of ERC-20 that NightMarket uses (USDC returns bool on transfers).
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}
