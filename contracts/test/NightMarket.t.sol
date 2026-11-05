// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {NightMarket} from "../src/NightMarket.sol";
import {Owned} from "../src/Owned.sol";
import {TestUSDC} from "./doubles/TestUSDC.sol";
import {TestEditionsRegistry} from "./doubles/TestEditionsRegistry.sol";
import {ReentrantUSDC, ReentrantRegistry} from "./doubles/Reentrant.sol";

contract NightMarketTest is Test {
    // Written out independently of NightMarket on purpose.
    uint256 constant ROLE_CAN_TRANSFER_ADMIN = (uint256(1) << 28) << 128;

    TestUSDC usdc;
    TestEditionsRegistry editions; //       the seller's namespace
    TestEditionsRegistry vendorEditions; // the vendor's namespace (commissions)
    NightMarket market;

    address commons = makeAddr("commons");
    address server = makeAddr("server");
    address seller = makeAddr("seller");
    address vendor = makeAddr("vendor");
    address buyer = makeAddr("buyer");
    address agent = makeAddr("agent");
    address agentOwner = makeAddr("agentOwner");
    address stranger = makeAddr("stranger");

    bytes32 constant PIECE = keccak256("piece:sea-roof");
    bytes32 constant JOB = keccak256("commission:1");
    bytes32 constant ROOT = keccak256("root");

    uint256 constant PRICE = 10e6; // 10 USDC
    uint256 constant FEE = 20e6; // 20 USDC
    uint16 constant COMMONS_BPS = 500; // 5%
    uint16 constant VENDOR_BPS = 2000; // 20%

    function setUp() public {
        usdc = new TestUSDC();
        editions = new TestEditionsRegistry();
        vendorEditions = new TestEditionsRegistry();
        market = _deploy(address(usdc), COMMONS_BPS);

        usdc.mint(buyer, 1_000e6);
        vm.prank(buyer);
        usdc.approve(address(market), type(uint256).max);
    }

    // ---------------------------------------------------------------- helpers

    /// @dev A market with the server as operator and the usual bindings in place.
    function _deploy(address token, uint16 commonsBps) internal returns (NightMarket m) {
        m = new NightMarket(token, commons, commonsBps);
        m.setOperator(server, true);
        vm.startPrank(server);
        m.bindRegistry(address(editions), seller);
        m.bindRegistry(address(vendorEditions), agentOwner);
        m.bindAgent(agent, agentOwner);
        vm.stopPrank();
    }

    function _list(uint32 maxEditions) internal {
        vm.prank(server);
        market.listPiece(PIECE, seller, address(editions), "sea-roof", PRICE, maxEditions, vendor, VENDOR_BPS);
    }

    function _buy() internal returns (uint32 editionNo, uint256 tokenId) {
        vm.prank(buyer);
        return market.buy(PIECE, PRICE);
    }

    function _request() internal returns (uint64 deadline) {
        deadline = uint64(block.timestamp + 1 days);
        vm.prank(buyer);
        market.requestCommission(JOB, agent, agentOwner, FEE, deadline, address(vendorEditions), "night-swim");
    }

    function _status(bytes32 id) internal view returns (uint256) {
        return uint256(market.commissions(id).status);
    }

    // ---------------------------------------------------------------- admin

    function test_Constructor_SetsFields() public view {
        assertEq(market.owner(), address(this));
        assertEq(address(market.usdc()), address(usdc));
        assertEq(market.commonsFund(), commons);
        assertEq(market.commonsBps(), COMMONS_BPS);
        assertEq(market.ROLE_CAN_TRANSFER_ADMIN(), ROLE_CAN_TRANSFER_ADMIN);
        assertEq(market.EXPIRY_FOREVER(), type(uint64).max);
    }

    function test_Constructor_CapsCommonsBps() public {
        new NightMarket(address(usdc), commons, 2000);
        vm.expectRevert(NightMarket.BpsTooHigh.selector);
        new NightMarket(address(usdc), commons, 2001);
    }

    function test_Constructor_RejectsBadAddresses() public {
        vm.expectRevert(NightMarket.NotContract.selector);
        new NightMarket(stranger, commons, 500);
        vm.expectRevert(Owned.ZeroAddress.selector);
        new NightMarket(address(usdc), address(0), 500);
    }

    function test_SetOperator_OnlyOwner() public {
        vm.expectEmit(address(market));
        emit NightMarket.OperatorSet(stranger, true);
        market.setOperator(stranger, true);
        assertTrue(market.operators(stranger));

        vm.prank(stranger);
        vm.expectRevert(Owned.NotOwner.selector);
        market.setOperator(stranger, false);
    }

    function test_SetCommonsFund_OnlyOwner() public {
        address next = makeAddr("nextCommons");
        market.setCommonsFund(next);
        assertEq(market.commonsFund(), next);

        vm.expectRevert(Owned.ZeroAddress.selector);
        market.setCommonsFund(address(0));

        vm.prank(stranger);
        vm.expectRevert(Owned.NotOwner.selector);
        market.setCommonsFund(stranger);
    }

    // ---------------------------------------------------------------- bindings

    function test_BindRegistry_ByOperator() public {
        TestEditionsRegistry other = new TestEditionsRegistry();
        vm.expectEmit(address(market));
        emit NightMarket.RegistryBound(address(other), stranger);
        vm.prank(server);
        market.bindRegistry(address(other), stranger);
        assertEq(market.registryOwner(address(other)), stranger);
        assertEq(market.registryOwner(address(editions)), seller);
    }

    function test_BindAgent_ByOperator() public {
        address agent2 = makeAddr("agent2");
        vm.expectEmit(address(market));
        emit NightMarket.AgentBound(agent2, stranger);
        vm.prank(server);
        market.bindAgent(agent2, stranger);
        assertEq(market.agentOwner(agent2), stranger);
        assertEq(market.agentOwner(agent), agentOwner);
    }

    function test_Bind_OnlyOperators() public {
        // Strangers, sellers and even the owner (not an operator) cannot bind.
        address[3] memory callers = [stranger, seller, address(this)];
        for (uint256 i; i < callers.length; ++i) {
            vm.startPrank(callers[i]);
            vm.expectRevert(NightMarket.NotOperator.selector);
            market.bindRegistry(address(editions), callers[i]);
            vm.expectRevert(NightMarket.NotOperator.selector);
            market.bindAgent(agent, callers[i]);
            vm.stopPrank();
        }
        assertEq(market.registryOwner(address(editions)), seller);
        assertEq(market.agentOwner(agent), agentOwner);

        // A removed operator loses the right.
        market.setOperator(server, false);
        vm.prank(server);
        vm.expectRevert(NightMarket.NotOperator.selector);
        market.bindRegistry(address(editions), stranger);
    }

    function test_Bind_RejectsZeroSubject() public {
        vm.startPrank(server);
        vm.expectRevert(Owned.ZeroAddress.selector);
        market.bindRegistry(address(0), seller);
        vm.expectRevert(Owned.ZeroAddress.selector);
        market.bindAgent(address(0), agentOwner);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- listPiece

    function test_ListPiece_ByOperator() public {
        vm.expectEmit(address(market));
        emit NightMarket.PieceListed(PIECE, seller, address(editions), "sea-roof", PRICE, 3, vendor, VENDOR_BPS);
        _list(3);

        NightMarket.Piece memory p = market.pieces(PIECE);
        assertEq(p.seller, seller);
        assertEq(p.editionsRegistry, address(editions));
        assertEq(p.labelPrefix, "sea-roof");
        assertEq(p.priceUsdc, PRICE);
        assertEq(p.maxEditions, 3);
        assertEq(p.vendorPayout, vendor);
        assertEq(p.vendorBps, VENDOR_BPS);
        assertEq(p.sold, 0);
        assertTrue(p.active);
    }

    function test_ListPiece_BySellerWithoutVendor() public {
        vm.prank(seller);
        market.listPiece(PIECE, seller, address(editions), "sea-roof", PRICE, 1, address(0), 0);
        assertTrue(market.pieces(PIECE).active);
    }

    function test_ListPiece_StrangerReverts() public {
        vm.prank(stranger);
        vm.expectRevert(NightMarket.NotAuthorized.selector);
        market.listPiece(PIECE, seller, address(editions), "sea-roof", PRICE, 1, address(0), 0);
    }

    function test_ListPiece_DuplicateReverts() public {
        _list(1);
        vm.prank(server);
        vm.expectRevert(NightMarket.PieceExists.selector);
        market.listPiece(PIECE, seller, address(editions), "other", PRICE, 1, address(0), 0);
    }

    function test_ListPiece_DelistedIdCannotBeReused() public {
        _list(1);
        vm.prank(seller);
        market.delist(PIECE);
        vm.prank(server);
        vm.expectRevert(NightMarket.PieceExists.selector);
        market.listPiece(PIECE, seller, address(editions), "sea-roof", PRICE, 1, address(0), 0);
    }

    function test_ListPiece_UnboundRegistryReverts() public {
        TestEditionsRegistry unbound = new TestEditionsRegistry();

        vm.prank(seller);
        vm.expectRevert(NightMarket.RegistryNotBound.selector);
        market.listPiece(PIECE, seller, address(unbound), "sea-roof", PRICE, 1, address(0), 0);

        vm.prank(server);
        vm.expectRevert(NightMarket.RegistryNotBound.selector);
        market.listPiece(PIECE, seller, address(unbound), "sea-roof", PRICE, 1, address(0), 0);
    }

    function test_ListPiece_SomeoneElsesRegistryReverts() public {
        // A stranger listing for themselves in the seller's namespace.
        vm.prank(stranger);
        vm.expectRevert(NightMarket.RegistryNotBound.selector);
        market.listPiece(PIECE, stranger, address(editions), "sea-roof", PRICE, 1, address(0), 0);

        // The seller listing into the vendor's namespace, by themselves or via the operator.
        vm.prank(seller);
        vm.expectRevert(NightMarket.RegistryNotBound.selector);
        market.listPiece(PIECE, seller, address(vendorEditions), "sea-roof", PRICE, 1, address(0), 0);

        vm.prank(server);
        vm.expectRevert(NightMarket.RegistryNotBound.selector);
        market.listPiece(PIECE, seller, address(vendorEditions), "sea-roof", PRICE, 1, address(0), 0);
    }

    function test_ListPiece_UnbindStopsNewListings() public {
        _list(2);

        vm.expectEmit(address(market));
        emit NightMarket.RegistryBound(address(editions), address(0));
        vm.prank(server);
        market.bindRegistry(address(editions), address(0));
        assertEq(market.registryOwner(address(editions)), address(0));

        vm.prank(server);
        vm.expectRevert(NightMarket.RegistryNotBound.selector);
        market.listPiece(keccak256("piece:2"), seller, address(editions), "lighthouse", PRICE, 1, address(0), 0);

        // A piece listed before the unbind keeps selling.
        (uint32 editionNo,) = _buy();
        assertEq(editionNo, 1);
    }

    function test_ListPiece_Validation() public {
        vm.startPrank(server);

        vm.expectRevert(NightMarket.ZeroPrice.selector);
        market.listPiece(PIECE, seller, address(editions), "sea-roof", 0, 1, address(0), 0);

        vm.expectRevert(NightMarket.ZeroEditions.selector);
        market.listPiece(PIECE, seller, address(editions), "sea-roof", PRICE, 0, address(0), 0);

        vm.expectRevert(Owned.ZeroAddress.selector);
        market.listPiece(PIECE, address(0), address(editions), "sea-roof", PRICE, 1, address(0), 0);

        vm.expectRevert(Owned.ZeroAddress.selector);
        market.listPiece(PIECE, seller, address(0), "sea-roof", PRICE, 1, address(0), 0);

        vm.expectRevert(NightMarket.BadLabel.selector);
        market.listPiece(PIECE, seller, address(editions), "", PRICE, 1, address(0), 0);

        vm.expectRevert(NightMarket.BadLabel.selector);
        market.listPiece(PIECE, seller, address(editions), "sea.roof", PRICE, 1, address(0), 0);

        vm.expectRevert(NightMarket.BadLabel.selector);
        market.listPiece(PIECE, seller, address(editions), "sea-roof.", PRICE, 1, address(0), 0);

        // vendor share without a payout address
        vm.expectRevert(NightMarket.BadSplit.selector);
        market.listPiece(PIECE, seller, address(editions), "sea-roof", PRICE, 1, address(0), 100);

        vm.stopPrank();
    }

    function test_ListPiece_SplitCap() public {
        // commons is 500 bps, so the vendor may take at most 9500.
        vm.prank(server);
        vm.expectRevert(NightMarket.BadSplit.selector);
        market.listPiece(PIECE, seller, address(editions), "sea-roof", PRICE, 1, vendor, 9501);

        vm.prank(server);
        market.listPiece(PIECE, seller, address(editions), "sea-roof", PRICE, 1, vendor, 9500);
        assertEq(market.pieces(PIECE).vendorBps, 9500);
    }

    // ---------------------------------------------------------------- buy

    function test_Buy_SplitsExactly() public {
        _list(3);
        uint256 buyerBefore = usdc.balanceOf(buyer);

        _buy();

        assertEq(usdc.balanceOf(commons), 500_000); //   5% of 10 USDC
        assertEq(usdc.balanceOf(vendor), 2_000_000); // 20%
        assertEq(usdc.balanceOf(seller), 7_500_000); // remainder
        assertEq(usdc.balanceOf(buyer), buyerBefore - PRICE);
        assertEq(usdc.balanceOf(address(market)), 0);
    }

    function test_Buy_RoundingGoesToSeller() public {
        vm.prank(server);
        market.listPiece(PIECE, seller, address(editions), "sea-roof", 7, 1, vendor, VENDOR_BPS);
        _buy();
        assertEq(usdc.balanceOf(commons), 0); // 7 * 500 / 10000 = 0.35
        assertEq(usdc.balanceOf(vendor), 1); //  7 * 2000 / 10000 = 1.4
        assertEq(usdc.balanceOf(seller), 6);
    }

    function test_Buy_NoVendor() public {
        vm.prank(seller);
        market.listPiece(PIECE, seller, address(editions), "sea-roof", PRICE, 1, address(0), 0);
        _buy();
        assertEq(usdc.balanceOf(commons), 500_000);
        assertEq(usdc.balanceOf(seller), 9_500_000);
    }

    function testFuzz_Buy_PartsSumToPrice(uint256 price, uint16 commonsBps, uint16 vendorBps) public {
        price = bound(price, 1, type(uint128).max);
        commonsBps = uint16(bound(commonsBps, 0, 2000));
        vendorBps = uint16(bound(vendorBps, 0, 10_000 - commonsBps));

        NightMarket m = _deploy(address(usdc), commonsBps);
        vm.prank(seller);
        m.listPiece(PIECE, seller, address(editions), "fuzz", price, 1, vendor, vendorBps);

        address payer = makeAddr("payer");
        usdc.mint(payer, price);
        vm.startPrank(payer);
        usdc.approve(address(m), price);
        m.buy(PIECE, price);
        vm.stopPrank();

        uint256 c = usdc.balanceOf(commons);
        uint256 v = usdc.balanceOf(vendor);
        uint256 s = usdc.balanceOf(seller);
        assertEq(c + v + s, price);
        assertEq(c, (price * commonsBps) / 10_000);
        assertEq(v, (price * vendorBps) / 10_000);
        assertEq(usdc.balanceOf(payer), 0);
        assertEq(usdc.balanceOf(address(m)), 0);
    }

    function test_Buy_NumbersEditionsAndMintsToBuyer() public {
        _list(3);

        vm.expectEmit(address(market));
        emit NightMarket.EditionSold(PIECE, 1, buyer, "sea-roof-1", 1, PRICE);
        (uint32 n1, uint256 t1) = _buy();

        vm.expectEmit(address(market));
        emit NightMarket.EditionSold(PIECE, 2, buyer, "sea-roof-2", 2, PRICE);
        (uint32 n2, uint256 t2) = _buy();

        assertEq(n1, 1);
        assertEq(n2, 2);
        assertEq(market.pieces(PIECE).sold, 2);

        assertEq(editions.tokenOfLabel("sea-roof-1"), t1);
        assertEq(editions.tokenOfLabel("sea-roof-2"), t2);
        assertEq(editions.ownerOf(t1), buyer);
        assertEq(editions.ownerOf(t2), buyer);

        // Exact mint arguments: owner is the buyer, no subregistry, no resolver,
        // only the transfer-admin role, and no expiry. Called by the market.
        TestEditionsRegistry.Registration memory r = editions.registration(t2);
        assertEq(r.label, "sea-roof-2");
        assertEq(r.owner, buyer);
        assertEq(r.registry, address(0));
        assertEq(r.resolver, address(0));
        assertEq(r.roleBitmap, ROLE_CAN_TRANSFER_ADMIN);
        assertEq(r.expiry, type(uint64).max);
        assertEq(r.caller, address(market));
    }

    function test_Buy_LabelsPastNine() public {
        _list(12);
        for (uint256 i; i < 11; ++i) {
            _buy();
        }
        assertEq(editions.tokenOfLabel("sea-roof-10"), 10);
        assertEq(editions.tokenOfLabel("sea-roof-11"), 11);
    }

    function test_Buy_PriceRaisedAboveMaxReverts() public {
        _list(2);
        vm.prank(seller);
        market.setPrice(PIECE, PRICE + 1);

        vm.prank(buyer);
        vm.expectRevert(NightMarket.PriceTooHigh.selector);
        market.buy(PIECE, PRICE);
        assertEq(market.pieces(PIECE).sold, 0);
        assertEq(usdc.balanceOf(buyer), 1_000e6);

        // Paying exactly the new price works.
        vm.prank(buyer);
        market.buy(PIECE, PRICE + 1);
        assertEq(usdc.balanceOf(buyer), 1_000e6 - PRICE - 1);
    }

    function test_Buy_MaxPriceAboveIsFine() public {
        _list(1);
        vm.prank(buyer);
        market.buy(PIECE, type(uint256).max);
        assertEq(usdc.balanceOf(buyer), 1_000e6 - PRICE); // charged the price, not the cap
    }

    function test_Buy_SoldOut() public {
        _list(2);
        _buy();
        _buy();
        vm.prank(buyer);
        vm.expectRevert(NightMarket.SoldOut.selector);
        market.buy(PIECE, PRICE);
    }

    function test_Buy_UnknownPieceReverts() public {
        vm.prank(buyer);
        vm.expectRevert(NightMarket.NotListed.selector);
        market.buy(PIECE, PRICE);
    }

    function test_Buy_WithoutAllowanceReverts() public {
        _list(1);
        vm.prank(stranger);
        vm.expectRevert(TestUSDC.InsufficientAllowance.selector);
        market.buy(PIECE, PRICE);
    }

    function test_Buy_TakenLabelRevertsAndKeepsCount() public {
        _list(2);
        // Someone already holds edition 1's label in this registry.
        editions.register("sea-roof-1", stranger, address(0), address(0), ROLE_CAN_TRANSFER_ADMIN, type(uint64).max);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(TestEditionsRegistry.LabelTaken.selector, "sea-roof-1"));
        market.buy(PIECE, PRICE);
        assertEq(market.pieces(PIECE).sold, 0);
        assertEq(usdc.balanceOf(seller), 0);
    }

    // ---------------------------------------------------------------- delist / setPrice

    function test_Delist_BySellerStopsSales() public {
        _list(3);
        _buy();

        vm.expectEmit(address(market));
        emit NightMarket.PieceDelisted(PIECE);
        vm.prank(seller);
        market.delist(PIECE);
        assertFalse(market.pieces(PIECE).active);

        vm.prank(buyer);
        vm.expectRevert(NightMarket.NotListed.selector);
        market.buy(PIECE, PRICE);

        // Already sold editions stay with the buyer.
        assertEq(editions.ownerOf(1), buyer);
    }

    function test_Delist_ByOperator() public {
        _list(1);
        vm.prank(server);
        market.delist(PIECE);
        assertFalse(market.pieces(PIECE).active);

        vm.prank(server);
        vm.expectRevert(NightMarket.NotListed.selector);
        market.delist(PIECE);
    }

    function test_Delist_StrangerReverts() public {
        _list(1);
        vm.prank(stranger);
        vm.expectRevert(NightMarket.NotAuthorized.selector);
        market.delist(PIECE);
    }

    function test_SetPrice_BySeller() public {
        _list(2);
        vm.expectEmit(address(market));
        emit NightMarket.PriceSet(PIECE, 4e6);
        vm.prank(seller);
        market.setPrice(PIECE, 4e6);

        _buy();
        assertEq(usdc.balanceOf(commons) + usdc.balanceOf(vendor) + usdc.balanceOf(seller), 4e6);
    }

    function test_SetPrice_NonSellerReverts() public {
        _list(1);

        vm.prank(stranger);
        vm.expectRevert(NightMarket.NotSeller.selector);
        market.setPrice(PIECE, 1);

        // Operators can list and delist, but not reprice.
        vm.prank(server);
        vm.expectRevert(NightMarket.NotSeller.selector);
        market.setPrice(PIECE, 1);
    }

    function test_SetPrice_ZeroReverts() public {
        _list(1);
        vm.prank(seller);
        vm.expectRevert(NightMarket.ZeroPrice.selector);
        market.setPrice(PIECE, 0);
    }

    // ---------------------------------------------------------------- commissions

    function test_Commission_RequestEscrows() public {
        uint64 deadline = uint64(block.timestamp + 1 days);

        vm.expectEmit(address(market));
        emit NightMarket.CommissionRequested(
            JOB, buyer, agent, agentOwner, FEE, deadline, address(vendorEditions), "night-swim"
        );
        _request();

        assertEq(usdc.balanceOf(address(market)), FEE);
        assertEq(usdc.balanceOf(buyer), 1_000e6 - FEE);

        NightMarket.Commission memory c = market.commissions(JOB);
        assertEq(c.buyer, buyer);
        assertEq(uint256(c.status), uint256(NightMarket.Status.Open));
        assertEq(c.deadline, deadline);
        assertEq(c.vendorAgent, agent);
        assertEq(c.vendorOwner, agentOwner);
        assertEq(c.editionsRegistry, address(vendorEditions));
        assertEq(c.priceUsdc, FEE);
        assertEq(c.label, "night-swim");
    }

    function test_Commission_DeliverPaysAndMints() public {
        _request();

        vm.expectEmit(address(market));
        emit NightMarket.CommissionDelivered(JOB, ROOT, 1);
        vm.prank(agent);
        uint256 tokenId = market.deliver(JOB, ROOT);

        assertEq(usdc.balanceOf(commons), 1e6); //       5% of 20 USDC
        assertEq(usdc.balanceOf(agentOwner), 19e6); //   the rest
        assertEq(usdc.balanceOf(agent), 0);
        assertEq(usdc.balanceOf(address(market)), 0);

        assertEq(tokenId, 1);
        assertEq(vendorEditions.tokenOfLabel("night-swim"), 1);
        assertEq(vendorEditions.ownerOf(1), buyer);
        TestEditionsRegistry.Registration memory r = vendorEditions.registration(1);
        assertEq(r.roleBitmap, ROLE_CAN_TRANSFER_ADMIN);
        assertEq(r.expiry, type(uint64).max);

        assertEq(_status(JOB), uint256(NightMarket.Status.Delivered));
    }

    function test_Commission_DeliverOnDeadlineWorks() public {
        uint64 deadline = _request();
        vm.warp(deadline);
        vm.prank(agent);
        market.deliver(JOB, ROOT);
        assertEq(_status(JOB), uint256(NightMarket.Status.Delivered));
    }

    function test_Commission_RequestValidation() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        vm.startPrank(buyer);

        vm.expectRevert(NightMarket.BadDeadline.selector);
        market.requestCommission(JOB, agent, agentOwner, FEE, uint64(block.timestamp), address(vendorEditions), "x");

        vm.expectRevert(NightMarket.ZeroPrice.selector);
        market.requestCommission(JOB, agent, agentOwner, 0, deadline, address(vendorEditions), "x");

        vm.expectRevert(Owned.ZeroAddress.selector);
        market.requestCommission(JOB, address(0), agentOwner, FEE, deadline, address(vendorEditions), "x");

        vm.expectRevert(Owned.ZeroAddress.selector);
        market.requestCommission(JOB, agent, address(0), FEE, deadline, address(vendorEditions), "x");

        vm.expectRevert(Owned.ZeroAddress.selector);
        market.requestCommission(JOB, agent, agentOwner, FEE, deadline, address(0), "x");

        vm.expectRevert(NightMarket.BadLabel.selector);
        market.requestCommission(JOB, agent, agentOwner, FEE, deadline, address(vendorEditions), "a.b");

        vm.expectRevert(NightMarket.BadLabel.selector);
        market.requestCommission(JOB, agent, agentOwner, FEE, deadline, address(vendorEditions), "");

        vm.stopPrank();
    }

    function test_Commission_UnboundAgentReverts() public {
        address rogue = makeAddr("rogue");
        vm.prank(buyer);
        vm.expectRevert(NightMarket.AgentNotBound.selector);
        market.requestCommission(
            JOB, rogue, agentOwner, FEE, uint64(block.timestamp + 1 days), address(vendorEditions), "x"
        );
    }

    function test_Commission_AgentOwnerMismatchReverts() public {
        // The agent belongs to agentOwner, so naming anyone else as vendor owner fails,
        // even when that account owns the registry.
        vm.prank(server);
        market.bindRegistry(address(vendorEditions), stranger);

        vm.prank(buyer);
        vm.expectRevert(NightMarket.AgentNotBound.selector);
        market.requestCommission(
            JOB, agent, stranger, FEE, uint64(block.timestamp + 1 days), address(vendorEditions), "x"
        );
    }

    function test_Commission_SomeoneElsesRegistryReverts() public {
        uint64 deadline = uint64(block.timestamp + 1 days);

        // The seller's namespace, not the vendor's.
        vm.prank(buyer);
        vm.expectRevert(NightMarket.RegistryNotBound.selector);
        market.requestCommission(JOB, agent, agentOwner, FEE, deadline, address(editions), "x");

        // An unbound registry.
        TestEditionsRegistry unbound = new TestEditionsRegistry();
        vm.prank(buyer);
        vm.expectRevert(NightMarket.RegistryNotBound.selector);
        market.requestCommission(JOB, agent, agentOwner, FEE, deadline, address(unbound), "x");

        assertEq(usdc.balanceOf(address(market)), 0);
    }

    function test_Commission_DuplicateIdReverts() public {
        _request();
        vm.prank(stranger);
        vm.expectRevert(NightMarket.CommissionExists.selector);
        market.requestCommission(JOB, agent, agentOwner, FEE, uint64(block.timestamp + 1), address(vendorEditions), "y");
    }

    function test_Commission_DeliverByNonAgentReverts() public {
        _request();
        address[3] memory others = [buyer, agentOwner, stranger];
        for (uint256 i; i < others.length; ++i) {
            vm.prank(others[i]);
            vm.expectRevert(NightMarket.NotVendorAgent.selector);
            market.deliver(JOB, ROOT);
        }
    }

    function test_Commission_DeliverAfterDeadlineReverts() public {
        uint64 deadline = _request();
        vm.warp(uint256(deadline) + 1);
        vm.prank(agent);
        vm.expectRevert(NightMarket.DeadlinePassed.selector);
        market.deliver(JOB, ROOT);
    }

    function test_Commission_DeliverEmptyRootReverts() public {
        _request();
        vm.prank(agent);
        vm.expectRevert(NightMarket.EmptyRoot.selector);
        market.deliver(JOB, bytes32(0));
    }

    function test_Commission_DeliverUnknownReverts() public {
        vm.prank(agent);
        vm.expectRevert(NightMarket.NotOpen.selector);
        market.deliver(JOB, ROOT);
    }

    function test_Commission_RefundBeforeDeadlineReverts() public {
        uint64 deadline = _request();
        vm.prank(buyer);
        vm.expectRevert(NightMarket.TooEarly.selector);
        market.refund(JOB);

        // Still too early at the deadline itself: that second belongs to the agent.
        vm.warp(deadline);
        vm.prank(buyer);
        vm.expectRevert(NightMarket.TooEarly.selector);
        market.refund(JOB);
    }

    function test_Commission_RefundAfterDeadline() public {
        uint256 before = usdc.balanceOf(buyer);
        uint64 deadline = _request();
        vm.warp(uint256(deadline) + 1);

        vm.expectEmit(address(market));
        emit NightMarket.CommissionRefunded(JOB, buyer, FEE);
        vm.prank(buyer);
        market.refund(JOB);

        assertEq(usdc.balanceOf(buyer), before);
        assertEq(usdc.balanceOf(address(market)), 0);
        assertEq(usdc.balanceOf(agentOwner), 0);
        assertEq(vendorEditions.registrationCount(), 0);
        assertEq(_status(JOB), uint256(NightMarket.Status.Refunded));
    }

    function test_Commission_RefundByNonBuyerReverts() public {
        uint64 deadline = _request();
        vm.warp(uint256(deadline) + 1);
        vm.prank(stranger);
        vm.expectRevert(NightMarket.NotBuyer.selector);
        market.refund(JOB);
    }

    function test_Commission_NoDoubleRefund() public {
        uint64 deadline = _request();
        vm.warp(uint256(deadline) + 1);
        vm.startPrank(buyer);
        market.refund(JOB);
        vm.expectRevert(NightMarket.NotOpen.selector);
        market.refund(JOB);
        vm.stopPrank();
        assertEq(usdc.balanceOf(buyer), 1_000e6);
    }

    function test_Commission_NoDoubleDeliver() public {
        _request();
        vm.startPrank(agent);
        market.deliver(JOB, ROOT);
        vm.expectRevert(NightMarket.NotOpen.selector);
        market.deliver(JOB, ROOT);
        vm.stopPrank();
        assertEq(usdc.balanceOf(agentOwner), 19e6);
    }

    function test_Commission_NoRefundAfterDeliver() public {
        uint64 deadline = _request();
        vm.prank(agent);
        market.deliver(JOB, ROOT);

        vm.warp(uint256(deadline) + 1);
        vm.prank(buyer);
        vm.expectRevert(NightMarket.NotOpen.selector);
        market.refund(JOB);
    }

    function test_Commission_NoDeliverAfterRefund() public {
        uint64 deadline = _request();
        vm.warp(uint256(deadline) + 1);
        vm.prank(buyer);
        market.refund(JOB);

        // Even a late delivery is rejected on status before the deadline check.
        vm.prank(agent);
        vm.expectRevert(NightMarket.NotOpen.selector);
        market.deliver(JOB, ROOT);
    }

    // ---------------------------------------------------------------- reentrancy

    function test_Reentrancy_RegistryReentersBuy() public {
        ReentrantRegistry evil = new ReentrantRegistry();
        vm.startPrank(server);
        market.bindRegistry(address(evil), seller);
        market.listPiece(PIECE, seller, address(evil), "sea-roof", PRICE, 5, address(0), 0);
        vm.stopPrank();
        evil.arm(address(market), abi.encodeCall(NightMarket.buy, (PIECE, PRICE)));

        vm.prank(buyer);
        vm.expectRevert(NightMarket.Reentrancy.selector);
        market.buy(PIECE, PRICE);

        // Nothing moved and no edition was claimed.
        assertEq(market.pieces(PIECE).sold, 0);
        assertEq(usdc.balanceOf(seller), 0);
        assertEq(usdc.balanceOf(buyer), 1_000e6);
    }

    function test_Reentrancy_TokenReentersBuy() public {
        ReentrantUSDC evilUsdc = new ReentrantUSDC();
        NightMarket m = _deploy(address(evilUsdc), COMMONS_BPS);
        vm.prank(seller);
        m.listPiece(PIECE, seller, address(editions), "sea-roof", PRICE, 5, address(0), 0);

        evilUsdc.mint(buyer, PRICE * 2);
        vm.prank(buyer);
        evilUsdc.approve(address(m), type(uint256).max);
        evilUsdc.arm(address(m), abi.encodeCall(NightMarket.buy, (PIECE, PRICE)));

        vm.prank(buyer);
        vm.expectRevert(NightMarket.Reentrancy.selector);
        m.buy(PIECE, PRICE);
        assertEq(m.pieces(PIECE).sold, 0);
    }

    function test_Reentrancy_TokenReentersRefund() public {
        ReentrantUSDC evilUsdc = new ReentrantUSDC();
        NightMarket m = _deploy(address(evilUsdc), COMMONS_BPS);
        evilUsdc.mint(buyer, FEE);

        vm.startPrank(buyer);
        evilUsdc.approve(address(m), FEE);
        uint64 deadline = uint64(block.timestamp + 1 days);
        m.requestCommission(JOB, agent, agentOwner, FEE, deadline, address(vendorEditions), "night-swim");
        vm.stopPrank();

        // The payout transfer tries to call refund again.
        evilUsdc.arm(address(m), abi.encodeCall(NightMarket.refund, (JOB)));
        vm.warp(uint256(deadline) + 1);
        vm.prank(buyer);
        vm.expectRevert(NightMarket.Reentrancy.selector);
        m.refund(JOB);

        assertEq(evilUsdc.balanceOf(address(m)), FEE);
        assertEq(uint256(m.commissions(JOB).status), uint256(NightMarket.Status.Open));
    }
}
