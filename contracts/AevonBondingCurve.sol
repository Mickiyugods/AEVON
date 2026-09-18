// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract AevonBondingCurve {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    IERC20 public immutable usdg;
    address public immutable factory;

    uint256 public totalRaised;
    uint256 public tokensSold;
    bool public graduated;

    uint256 public constant GRADUATION_THRESHOLD = 69_000 * 1e18; // 69k USDG
    uint256 public constant FEE_BPS = 100; // 1%
    uint256 private constant BASE_PRICE = 1e6; // 0.000001 USDG (in wei with 18 decimals = 1e12)
    uint256 private constant K = 1e5; // quadratic constant

    address public feeRecipient;

    event Buy(address indexed buyer, uint256 usdgIn, uint256 tokensOut, uint256 newPrice);
    event Sell(address indexed seller, uint256 tokensIn, uint256 usdgOut, uint256 newPrice);
    event Graduated(address indexed token, uint256 totalRaised);

    constructor(address token_, address usdg_, address feeRecipient_) {
        token = IERC20(token_);
        usdg = IERC20(usdg_);
        factory = msg.sender;
        feeRecipient = feeRecipient_;
    }

    function getPrice() public view returns (uint256) {
        return BASE_PRICE + (K * tokensSold * tokensSold) / (1e18 * 1e18);
    }

    function getBuyPrice(uint256 usdgAmount) public view returns (uint256 tokensOut) {
        uint256 fee = (usdgAmount * FEE_BPS) / 10000;
        uint256 netAmount = usdgAmount - fee;
        uint256 currentPrice = getPrice();
        if (currentPrice == 0) return 0;
        tokensOut = (netAmount * 1e18) / currentPrice;
    }

    function getSellPrice(uint256 tokenAmount) public view returns (uint256 usdgOut) {
        uint256 currentPrice = getPrice();
        uint256 grossAmount = (tokenAmount * currentPrice) / 1e18;
        uint256 fee = (grossAmount * FEE_BPS) / 10000;
        usdgOut = grossAmount - fee;
    }

    function buy(uint256 usdgAmount) external returns (uint256 tokensOut) {
        require(!graduated, "Token graduated");
        require(usdgAmount > 0, "Zero amount");

        uint256 fee = (usdgAmount * FEE_BPS) / 10000;
        uint256 netAmount = usdgAmount - fee;

        usdg.safeTransferFrom(msg.sender, address(this), netAmount);
        if (fee > 0) usdg.safeTransferFrom(msg.sender, feeRecipient, fee);

        uint256 currentPrice = getPrice();
        tokensOut = (netAmount * 1e18) / currentPrice;

        require(token.balanceOf(address(this)) >= tokensOut, "Insufficient tokens");
        token.safeTransfer(msg.sender, tokensOut);

        tokensSold += tokensOut;
        totalRaised += netAmount;

        if (totalRaised >= GRADUATION_THRESHOLD) {
            graduated = true;
            emit Graduated(address(token), totalRaised);
        }

        emit Buy(msg.sender, usdgAmount, tokensOut, getPrice());
    }

    function sell(uint256 tokenAmount) external returns (uint256 usdgOut) {
        require(!graduated, "Token graduated");
        require(tokenAmount > 0, "Zero amount");

        uint256 currentPrice = getPrice();
        uint256 grossAmount = (tokenAmount * currentPrice) / 1e18;
        uint256 fee = (grossAmount * FEE_BPS) / 10000;
        usdgOut = grossAmount - fee;

        require(usdg.balanceOf(address(this)) >= usdgOut, "Insufficient USDG");

        token.safeTransferFrom(msg.sender, address(this), tokenAmount);
        usdg.safeTransfer(msg.sender, usdgOut);
        if (fee > 0) usdg.safeTransfer(feeRecipient, fee);

        tokensSold -= tokenAmount;
        totalRaised -= grossAmount;

        emit Sell(msg.sender, tokenAmount, usdgOut, getPrice());
    }

    function reserveBalance() external view returns (uint256) {
        return usdg.balanceOf(address(this));
    }
}
