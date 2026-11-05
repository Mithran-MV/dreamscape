// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Owned} from "./Owned.sol";

/// @title DreamRegistry
/// @notice Public receipts for Dreamscape. Each dream day and each generated piece gets one
/// record, so anyone can check what was made, for whom, by which model and under which
/// 0G request ID. Deployed on 0G Galileo (chain 16602).
/// @dev `kind` values:
///   0 portrait, 1 comic, 2 living portrait, 3 narration, 4 world dream.
/// It stays a plain uint8 (not validated) so new kinds need no redeploy.
/// `model` and `requestId` are emitted in `Anchored` only, to keep storage small.
contract DreamRegistry is Owned {
    struct Record {
        address dreamer; //    slot 0
        uint64 day; //         slot 0: UTC day number (unix seconds / 86400)
        uint8 kind; //         slot 0: see the kind table above
        bytes32 storageRoot; // slot 1: 0G Storage root of the encrypted file
        uint64 timestamp; //   slot 2: block time when anchored
    }

    /// @notice Addresses allowed to anchor (the app server).
    mapping(address => bool) public isWriter;

    uint256 private _count;
    mapping(uint256 => Record) private _records; // ids start at 1
    mapping(address => uint256[]) private _idsOf;

    event WriterSet(address indexed writer, bool allowed);
    event Anchored(
        uint256 indexed id,
        address indexed dreamer,
        uint64 indexed day,
        uint8 kind,
        bytes32 storageRoot,
        string model,
        string requestId
    );

    error NotWriter();
    error UnknownId(uint256 id);

    /// @notice Add (`allowed = true`) or remove a writer.
    function setWriter(address writer, bool allowed) external onlyOwner {
        if (writer == address(0)) revert ZeroAddress();
        // WriterSet is emitted right below; the lint does not see it.
        // forge-lint: disable-next-line(missing-events-access-control)
        isWriter[writer] = allowed;
        emit WriterSet(writer, allowed);
    }

    /// @notice Record one generated artefact. Returns its id (1, 2, 3, ...).
    function anchor(
        address dreamer,
        uint64 day,
        uint8 kind,
        bytes32 storageRoot,
        string calldata model,
        string calldata requestId
    ) external returns (uint256 id) {
        if (!isWriter[msg.sender]) revert NotWriter();
        if (dreamer == address(0)) revert ZeroAddress();

        id = ++_count;
        // uint64 seconds lasts for billions of years.
        // forge-lint: disable-next-line(unsafe-typecast)
        _records[id] = Record(dreamer, day, kind, storageRoot, uint64(block.timestamp));
        _idsOf[dreamer].push(id);

        emit Anchored(id, dreamer, day, kind, storageRoot, model, requestId);
    }

    /// @notice Total records anchored; also the highest id.
    function count() external view returns (uint256) {
        return _count;
    }

    function get(uint256 id) external view returns (Record memory) {
        if (id == 0 || id > _count) revert UnknownId(id);
        return _records[id];
    }

    /// @notice Number of records for one dreamer.
    function countOf(address dreamer) external view returns (uint256) {
        return _idsOf[dreamer].length;
    }

    /// @notice All record ids for one dreamer, oldest first.
    function idsOf(address dreamer) external view returns (uint256[] memory) {
        return _idsOf[dreamer];
    }

    /// @notice One page of a dreamer's record ids, oldest first. Out-of-range pages are empty.
    function idsOf(address dreamer, uint256 offset, uint256 limit) external view returns (uint256[] memory page) {
        uint256[] storage all = _idsOf[dreamer];
        if (offset >= all.length) return page;

        uint256 n = all.length - offset;
        if (limit < n) n = limit;

        page = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            page[i] = all[offset + i];
        }
    }
}
