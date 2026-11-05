// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Owned} from "./Owned.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {IEditionsRegistry} from "./interfaces/IEditionsRegistry.sol";

/// @title NightMarket
/// @notice USDC checkout for Dreamscape on Ethereum Sepolia.
///  - Pieces sell as numbered editions. Each edition is minted as an ENSv2 subname
///    ("<labelPrefix>-<n>") in the dreamer's editions registry, owned by the buyer.
///  - Commissions hold the buyer's USDC in escrow until the vendor agent delivers
///    (vendor is paid, buyer gets a one-of-one name) or the deadline passes (buyer refunds).
/// Every sale and delivery sends `commonsBps` of the price to the commons fund.
/// @dev NightMarket holds ROLE_REGISTRAR on each editions registry. It never holds or
/// requests a role on a minted name: the buyer is the owner and gets the only role bits.
contract NightMarket is Owned {
    // ---------------------------------------------------------------- constants

    uint16 public constant MAX_COMMONS_BPS = 2000;
    uint16 private constant BPS = 10_000;

    /// @notice The only role granted on a minted edition: its owner may transfer it.
    uint256 public constant ROLE_CAN_TRANSFER_ADMIN = (1 << 28) << 128;
    /// @notice Editions never expire.
    uint64 public constant EXPIRY_FOREVER = type(uint64).max;

    // ---------------------------------------------------------------- types

    struct Piece {
        address seller; //           slot 0
        uint32 maxEditions; //       slot 0
        uint32 sold; //              slot 0: editions minted so far
        uint16 vendorBps; //         slot 0: vendor's share, 0 if no vendor
        bool active; //              slot 0: false once delisted
        address editionsRegistry; // slot 1: the dreamer's ENSv2 editions registry
        address vendorPayout; //     slot 2
        uint256 priceUsdc; //        slot 3: 6 decimals
        string labelPrefix; //       slot 4: edition n is "<labelPrefix>-<n>"
    }

    enum Status {
        None,
        Open,
        Delivered,
        Refunded
    }

    struct Commission {
        address buyer; //            slot 0
        Status status; //            slot 0
        uint64 deadline; //          slot 0: last second the agent may deliver
        address vendorAgent; //      slot 1: the only address that may deliver
        address vendorOwner; //      slot 2: receives the vendor's payment
        address editionsRegistry; // slot 3
        uint256 priceUsdc; //        slot 4: held in escrow while Open
        string label; //             slot 5: one-of-one name minted to the buyer
    }

    // ---------------------------------------------------------------- state

    IERC20 public immutable usdc;
    /// @notice Commons share in basis points, fixed at deploy (at most MAX_COMMONS_BPS).
    uint16 public immutable commonsBps;
    address public commonsFund;

    /// @notice Trusted callers (the app server) that may list and delist for sellers.
    mapping(address => bool) public operators;

    mapping(bytes32 => Piece) private _pieces;
    mapping(bytes32 => Commission) private _commissions;

    bool private transient _entered;

    // ---------------------------------------------------------------- events

    event OperatorSet(address indexed operator, bool allowed);
    event CommonsFundSet(address indexed commonsFund);

    event PieceListed(
        bytes32 indexed pieceId,
        address indexed seller,
        address indexed editionsRegistry,
        string labelPrefix,
        uint256 priceUsdc,
        uint32 maxEditions,
        address vendorPayout,
        uint16 vendorBps
    );
    event PieceDelisted(bytes32 indexed pieceId);
    event PriceSet(bytes32 indexed pieceId, uint256 priceUsdc);
    event EditionSold(
        bytes32 indexed pieceId, uint32 editionNo, address indexed buyer, string label, uint256 tokenId, uint256 price
    );

    event CommissionRequested(
        bytes32 indexed commissionId,
        address indexed buyer,
        address indexed vendorAgent,
        address vendorOwner,
        uint256 priceUsdc,
        uint64 deadline,
        address editionsRegistry,
        string label
    );
    event CommissionDelivered(bytes32 indexed commissionId, bytes32 storageRoot, uint256 tokenId);
    event CommissionRefunded(bytes32 indexed commissionId, address indexed buyer, uint256 amount);

    // ---------------------------------------------------------------- errors

    error BpsTooHigh();
    error NotContract();
    error NotAuthorized();
    error NotSeller();
    error PieceExists();
    error ZeroPrice();
    error ZeroEditions();
    error BadSplit();
    error BadLabel();
    error NotListed();
    error SoldOut();
    error CommissionExists();
    error BadDeadline();
    error NotOpen();
    error NotVendorAgent();
    error NotBuyer();
    error DeadlinePassed();
    error TooEarly();
    error EmptyRoot();
    error TransferFailed();
    error Reentrancy();

    // ---------------------------------------------------------------- setup

    modifier nonReentrant() {
        if (_entered) revert Reentrancy();
        _entered = true;
        _;
        _entered = false;
    }

    constructor(address usdc_, address commonsFund_, uint16 commonsBps_) {
        if (usdc_.code.length == 0) revert NotContract();
        if (commonsFund_ == address(0)) revert ZeroAddress();
        if (commonsBps_ > MAX_COMMONS_BPS) revert BpsTooHigh();
        usdc = IERC20(usdc_);
        commonsFund = commonsFund_;
        commonsBps = commonsBps_;
        emit CommonsFundSet(commonsFund_);
    }

    function setOperator(address operator, bool allowed) external onlyOwner {
        if (operator == address(0)) revert ZeroAddress();
        operators[operator] = allowed;
        emit OperatorSet(operator, allowed);
    }

    function setCommonsFund(address commonsFund_) external onlyOwner {
        if (commonsFund_ == address(0)) revert ZeroAddress();
        commonsFund = commonsFund_;
        emit CommonsFundSet(commonsFund_);
    }

    // ---------------------------------------------------------------- pieces

    /// @notice List a piece for sale as `maxEditions` numbered editions.
    /// Callable by an operator or by the seller. `vendorPayout`/`vendorBps` may be zero.
    function listPiece(
        bytes32 pieceId,
        address seller,
        address editionsRegistry,
        string calldata labelPrefix,
        uint256 priceUsdc,
        uint32 maxEditions,
        address vendorPayout,
        uint16 vendorBps
    ) external {
        if (msg.sender != seller && !operators[msg.sender]) revert NotAuthorized();
        if (seller == address(0) || editionsRegistry == address(0)) revert ZeroAddress();
        if (_pieces[pieceId].seller != address(0)) revert PieceExists();
        if (priceUsdc == 0) revert ZeroPrice();
        if (maxEditions == 0) revert ZeroEditions();
        if (uint256(vendorBps) + commonsBps > BPS) revert BadSplit();
        if (vendorBps != 0 && vendorPayout == address(0)) revert BadSplit();
        _checkLabel(labelPrefix);

        Piece storage p = _pieces[pieceId];
        p.seller = seller;
        p.maxEditions = maxEditions;
        p.vendorBps = vendorBps;
        p.active = true;
        p.editionsRegistry = editionsRegistry;
        p.vendorPayout = vendorPayout;
        p.priceUsdc = priceUsdc;
        p.labelPrefix = labelPrefix;

        emit PieceListed(
            pieceId, seller, editionsRegistry, labelPrefix, priceUsdc, maxEditions, vendorPayout, vendorBps
        );
    }

    /// @notice Stop sales. Editions already sold are unaffected. A delisted id cannot be reused.
    function delist(bytes32 pieceId) external {
        Piece storage p = _pieces[pieceId];
        if (msg.sender != p.seller && !operators[msg.sender]) revert NotAuthorized();
        if (!p.active) revert NotListed();
        p.active = false;
        emit PieceDelisted(pieceId);
    }

    function setPrice(bytes32 pieceId, uint256 newPrice) external {
        Piece storage p = _pieces[pieceId];
        if (msg.sender != p.seller) revert NotSeller();
        if (newPrice == 0) revert ZeroPrice();
        p.priceUsdc = newPrice;
        emit PriceSet(pieceId, newPrice);
    }

    /// @notice Buy the next edition. The caller must have approved `priceUsdc`.
    /// The split: commons = price * commonsBps / 10000, vendor = price * vendorBps / 10000,
    /// seller = the remainder, so the three parts always sum to the price.
    function buy(bytes32 pieceId) external nonReentrant returns (uint32 editionNo, uint256 tokenId) {
        Piece storage p = _pieces[pieceId];
        if (!p.active) revert NotListed();
        if (p.sold >= p.maxEditions) revert SoldOut();

        // Effects: claim the edition number and work out the split before any external call.
        editionNo = ++p.sold;
        uint256 price = p.priceUsdc;
        uint256 toCommons = (price * commonsBps) / BPS;
        uint256 toVendor = (price * p.vendorBps) / BPS;
        string memory label = string.concat(p.labelPrefix, "-", _toString(editionNo));

        // Interactions: pull the full price once, then pay out.
        _pull(msg.sender, price);
        _pay(commonsFund, toCommons);
        _pay(p.vendorPayout, toVendor);
        _pay(p.seller, price - toCommons - toVendor);
        tokenId = _mint(p.editionsRegistry, label, msg.sender);

        // The tokenId only exists after the mint; nonReentrant keeps the log order honest.
        // forge-lint: disable-next-line(reentrancy-events)
        emit EditionSold(pieceId, editionNo, msg.sender, label, tokenId, price);
    }

    function pieces(bytes32 pieceId) external view returns (Piece memory) {
        return _pieces[pieceId];
    }

    // ---------------------------------------------------------------- commissions

    /// @notice Pay `priceUsdc` into escrow for a vendor agent to make a one-of-one piece.
    function requestCommission(
        bytes32 commissionId,
        address vendorAgent,
        address vendorOwner,
        uint256 priceUsdc,
        uint64 deadline,
        address editionsRegistry,
        string calldata label
    ) external nonReentrant {
        if (_commissions[commissionId].status != Status.None) revert CommissionExists();
        if (vendorAgent == address(0) || vendorOwner == address(0) || editionsRegistry == address(0)) {
            revert ZeroAddress();
        }
        if (priceUsdc == 0) revert ZeroPrice();
        // Deadlines are hours or days out, so a few seconds of block-time drift do not matter.
        // forge-lint: disable-next-line(block-timestamp)
        if (deadline <= block.timestamp) revert BadDeadline();
        _checkLabel(label);

        _commissions[commissionId] = Commission({
            buyer: msg.sender,
            status: Status.Open,
            deadline: deadline,
            vendorAgent: vendorAgent,
            vendorOwner: vendorOwner,
            editionsRegistry: editionsRegistry,
            priceUsdc: priceUsdc,
            label: label
        });
        emit CommissionRequested(
            commissionId, msg.sender, vendorAgent, vendorOwner, priceUsdc, deadline, editionsRegistry, label
        );

        _pull(msg.sender, priceUsdc);
    }

    /// @notice Vendor agent hands over the work (0G Storage root) on or before the deadline.
    /// Releases escrow (vendor owner gets price minus commons) and mints the label to the buyer.
    function deliver(bytes32 commissionId, bytes32 storageRoot) external nonReentrant returns (uint256 tokenId) {
        Commission storage c = _commissions[commissionId];
        if (c.status != Status.Open) revert NotOpen();
        if (msg.sender != c.vendorAgent) revert NotVendorAgent();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > c.deadline) revert DeadlinePassed();
        if (storageRoot == bytes32(0)) revert EmptyRoot();

        c.status = Status.Delivered;
        uint256 price = c.priceUsdc;
        uint256 toCommons = (price * commonsBps) / BPS;

        _pay(commonsFund, toCommons);
        _pay(c.vendorOwner, price - toCommons);
        tokenId = _mint(c.editionsRegistry, c.label, c.buyer);

        // forge-lint: disable-next-line(reentrancy-events)
        emit CommissionDelivered(commissionId, storageRoot, tokenId);
    }

    /// @notice Buyer takes the escrow back once the deadline has passed without delivery.
    function refund(bytes32 commissionId) external nonReentrant {
        Commission storage c = _commissions[commissionId];
        if (c.status != Status.Open) revert NotOpen();
        if (msg.sender != c.buyer) revert NotBuyer();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp <= c.deadline) revert TooEarly();

        c.status = Status.Refunded;
        uint256 amount = c.priceUsdc;
        emit CommissionRefunded(commissionId, msg.sender, amount);

        _pay(msg.sender, amount);
    }

    function commissions(bytes32 commissionId) external view returns (Commission memory) {
        return _commissions[commissionId];
    }

    // ---------------------------------------------------------------- internals

    // These helpers are only reached from nonReentrant functions. The state write the
    // reentrancy lint sees after each call is the guard resetting itself.
    // forge-lint: disable-start(reentrancy-no-eth)

    function _pull(address from, uint256 amount) private {
        if (!usdc.transferFrom(from, address(this), amount)) revert TransferFailed();
    }

    function _pay(address to, uint256 amount) private {
        if (amount == 0) return;
        if (!usdc.transfer(to, amount)) revert TransferFailed();
    }

    /// @dev Mint `label` forever to `to`. The owner gets ROLE_CAN_TRANSFER_ADMIN; no subregistry, no resolver.
    function _mint(address registry, string memory label, address to) private returns (uint256) {
        return IEditionsRegistry(registry)
            .register(label, to, address(0), address(0), ROLE_CAN_TRANSFER_ADMIN, EXPIRY_FOREVER);
    }

    // forge-lint: disable-end(reentrancy-no-eth)

    /// @dev A single DNS label: non-empty and no dots.
    function _checkLabel(string calldata label) private pure {
        bytes calldata b = bytes(label);
        bool ok = b.length != 0;
        for (uint256 i = 0; ok && i < b.length; ++i) {
            ok = b[i] != ".";
        }
        if (!ok) revert BadLabel();
    }

    function _toString(uint256 v) private pure returns (string memory) {
        bytes memory digits = "0123456789";
        uint256 len = 1;
        for (uint256 t = v / 10; t != 0; t /= 10) {
            ++len;
        }
        bytes memory out = new bytes(len);
        while (len != 0) {
            out[--len] = digits[v % 10];
            v /= 10;
        }
        return string(out);
    }
}
