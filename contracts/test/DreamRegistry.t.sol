// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {DreamRegistry} from "../src/DreamRegistry.sol";
import {Owned} from "../src/Owned.sol";

contract DreamRegistryTest is Test {
    DreamRegistry registry;

    address server = makeAddr("server");
    address stranger = makeAddr("stranger");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint64 constant DAY = 20_762; // 2026-11-05 UTC
    bytes32 constant ROOT = keccak256("root");

    function setUp() public {
        vm.warp(uint256(DAY) * 86_400 + 3_600);
        registry = new DreamRegistry();
        registry.setWriter(server, true);
    }

    function _anchor(address dreamer, uint8 kind) internal returns (uint256) {
        vm.prank(server);
        return registry.anchor(dreamer, DAY, kind, ROOT, "z-image-turbo", "req-1");
    }

    // ---------------------------------------------------------------- access control

    function test_DeployerIsOwner() public view {
        assertEq(registry.owner(), address(this));
    }

    function test_SetWriter_EmitsAndToggles() public {
        vm.expectEmit(address(registry));
        emit DreamRegistry.WriterSet(alice, true);
        registry.setWriter(alice, true);
        assertTrue(registry.isWriter(alice));

        vm.expectEmit(address(registry));
        emit DreamRegistry.WriterSet(alice, false);
        registry.setWriter(alice, false);
        assertFalse(registry.isWriter(alice));
    }

    function test_SetWriter_OnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(Owned.NotOwner.selector);
        registry.setWriter(stranger, true);
    }

    function test_SetWriter_RejectsZero() public {
        vm.expectRevert(Owned.ZeroAddress.selector);
        registry.setWriter(address(0), true);
    }

    function test_Anchor_NonWriterReverts() public {
        vm.prank(stranger);
        vm.expectRevert(DreamRegistry.NotWriter.selector);
        registry.anchor(alice, DAY, 0, ROOT, "m", "r");
    }

    function test_Anchor_OwnerIsNotWriterByDefault() public {
        vm.expectRevert(DreamRegistry.NotWriter.selector);
        registry.anchor(alice, DAY, 0, ROOT, "m", "r");
    }

    function test_Anchor_RemovedWriterReverts() public {
        registry.setWriter(server, false);
        vm.prank(server);
        vm.expectRevert(DreamRegistry.NotWriter.selector);
        registry.anchor(alice, DAY, 0, ROOT, "m", "r");
    }

    function test_TransferOwnership() public {
        vm.expectEmit(address(registry));
        emit Owned.OwnershipTransferred(address(this), alice);
        registry.transferOwnership(alice);
        assertEq(registry.owner(), alice);

        vm.expectRevert(Owned.NotOwner.selector);
        registry.setWriter(bob, true);

        vm.prank(alice);
        registry.setWriter(bob, true);
        assertTrue(registry.isWriter(bob));
    }

    // ---------------------------------------------------------------- anchoring

    function test_Anchor_StoresRecordAndEmits() public {
        vm.expectEmit(address(registry));
        emit DreamRegistry.Anchored(1, alice, DAY, 1, ROOT, "tencent/hy-image-3.5-preview", "req-42");

        vm.prank(server);
        uint256 id = registry.anchor(alice, DAY, 1, ROOT, "tencent/hy-image-3.5-preview", "req-42");

        assertEq(id, 1);
        assertEq(registry.count(), 1);

        DreamRegistry.Record memory r = registry.get(id);
        assertEq(r.dreamer, alice);
        assertEq(r.day, DAY);
        assertEq(r.kind, 1);
        assertEq(r.storageRoot, ROOT);
        assertEq(r.timestamp, block.timestamp);
    }

    function test_Anchor_RejectsZeroDreamer() public {
        vm.prank(server);
        vm.expectRevert(Owned.ZeroAddress.selector);
        registry.anchor(address(0), DAY, 0, ROOT, "m", "r");
    }

    function test_Anchor_IdsIncrementPerDreamer() public {
        assertEq(_anchor(alice, 0), 1);
        assertEq(_anchor(bob, 0), 2);
        assertEq(_anchor(alice, 1), 3);
        assertEq(_anchor(alice, 4), 4);

        assertEq(registry.count(), 4);
        assertEq(registry.countOf(alice), 3);
        assertEq(registry.countOf(bob), 1);

        uint256[] memory ids = registry.idsOf(alice);
        assertEq(ids.length, 3);
        assertEq(ids[0], 1);
        assertEq(ids[1], 3);
        assertEq(ids[2], 4);

        assertEq(registry.get(2).dreamer, bob);
        assertEq(registry.get(4).kind, 4);
    }

    function test_IdsOf_Paginated() public {
        for (uint256 i; i < 5; ++i) {
            _anchor(alice, 0);
        }

        uint256[] memory page = registry.idsOf(alice, 1, 2);
        assertEq(page.length, 2);
        assertEq(page[0], 2);
        assertEq(page[1], 3);

        // Limit past the end is clamped, even a huge one.
        page = registry.idsOf(alice, 3, type(uint256).max);
        assertEq(page.length, 2);
        assertEq(page[0], 4);
        assertEq(page[1], 5);

        assertEq(registry.idsOf(alice, 5, 10).length, 0);
        assertEq(registry.idsOf(alice, 0, 0).length, 0);
        assertEq(registry.idsOf(bob, 0, 10).length, 0);
    }

    function test_Get_UnknownIdReverts() public {
        _anchor(alice, 0);

        vm.expectRevert(abi.encodeWithSelector(DreamRegistry.UnknownId.selector, 0));
        registry.get(0);

        vm.expectRevert(abi.encodeWithSelector(DreamRegistry.UnknownId.selector, 2));
        registry.get(2);
    }
}
