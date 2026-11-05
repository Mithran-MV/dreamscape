// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IEditionsRegistry} from "../../src/interfaces/IEditionsRegistry.sol";

/// @notice Stand-in for a dreamer's ENSv2 editions registry. Records every register call,
/// hands out token ids 1, 2, 3, ... and rejects reused labels.
/// It also rejects any call that does not use the exact mint arguments NightMarket promises.
contract TestEditionsRegistry is IEditionsRegistry {
    // Written out here, not imported, so a wrong constant in NightMarket fails the tests.
    uint256 public constant EXPECTED_ROLES = (1 << 28) << 128;
    uint64 public constant EXPECTED_EXPIRY = type(uint64).max;

    struct Registration {
        string label;
        address owner;
        address registry;
        address resolver;
        uint256 roleBitmap;
        uint64 expiry;
        address caller;
    }

    Registration[] private _registrations;
    mapping(bytes32 => uint256) private _tokenOfLabel; // keccak256(label) => tokenId (0 = free)
    mapping(uint256 => address) public ownerOf;

    error LabelTaken(string label);
    error UnexpectedRoles(uint256 roleBitmap);
    error UnexpectedExpiry(uint64 expiry);
    error UnexpectedSubregistryOrResolver();

    function register(
        string calldata label,
        address owner,
        address registry,
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    ) external returns (uint256 tokenId) {
        if (roleBitmap != EXPECTED_ROLES) revert UnexpectedRoles(roleBitmap);
        if (expiry != EXPECTED_EXPIRY) revert UnexpectedExpiry(expiry);
        if (registry != address(0) || resolver != address(0)) revert UnexpectedSubregistryOrResolver();

        bytes32 key = keccak256(bytes(label));
        if (_tokenOfLabel[key] != 0) revert LabelTaken(label);

        _registrations.push(Registration(label, owner, registry, resolver, roleBitmap, expiry, msg.sender));
        tokenId = _registrations.length;
        _tokenOfLabel[key] = tokenId;
        ownerOf[tokenId] = owner;
    }

    function registrationCount() external view returns (uint256) {
        return _registrations.length;
    }

    /// @notice The `tokenId`-th registration (token ids start at 1).
    function registration(uint256 tokenId) external view returns (Registration memory) {
        return _registrations[tokenId - 1];
    }

    function tokenOfLabel(string calldata label) external view returns (uint256) {
        return _tokenOfLabel[keccak256(bytes(label))];
    }
}
