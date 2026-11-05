// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice A dreamer's ENSv2 "editions" registry (PermissionedRegistry / UserRegistry proxy).
/// Only `register` is needed; NightMarket holds ROLE_REGISTRAR on each one.
/// Signature checked against the deployed ABI.
interface IEditionsRegistry {
    function register(
        string calldata label,
        address owner,
        address registry,
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    ) external returns (uint256 tokenId);
}
