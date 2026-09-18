// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AevonToken.sol";
import "./AevonBondingCurve.sol";

contract AevonFactory {
    struct TokenInfo {
        address token;
        address curve;
        address creator;
        uint256 createdAt;
        string metadataURI;
    }

    TokenInfo[] public tokens;
    mapping(address => TokenInfo) public tokenByAddress;

    address public immutable usdg;
    address public feeRecipient;
    uint256 public creationFee = 0.5 ether; // 0.5 USDG

    event TokenCreated(
        address indexed token,
        address indexed curve,
        address indexed creator,
        string name,
        string symbol
    );

    constructor(address usdg_, address feeRecipient_) {
        usdg = usdg_;
        feeRecipient = feeRecipient_;
    }

    function createToken(
        string calldata name,
        string calldata symbol,
        uint256 totalSupply,
        string calldata metadataURI
    ) external payable returns (address tokenAddress, address curveAddress) {
        require(msg.value >= creationFee, "Insufficient fee");

        // Deploy bonding curve first (need address for token mint target)
        AevonBondingCurve curve = new AevonBondingCurve(
            address(0), // placeholder, updated below
            usdg,
            feeRecipient
        );

        // Deploy token, minting total supply to bonding curve
        AevonToken token = new AevonToken(name, symbol, totalSupply, address(curve));

        tokenAddress = address(token);
        curveAddress = address(curve);

        TokenInfo memory info = TokenInfo({
            token: tokenAddress,
            curve: curveAddress,
            creator: msg.sender,
            createdAt: block.timestamp,
            metadataURI: metadataURI
        });

        tokens.push(info);
        tokenByAddress[tokenAddress] = info;

        // Transfer fee to fee recipient
        if (msg.value > 0) {
            payable(feeRecipient).transfer(msg.value);
        }

        emit TokenCreated(tokenAddress, curveAddress, msg.sender, name, symbol);
    }

    function getTokenCount() external view returns (uint256) {
        return tokens.length;
    }

    function getToken(uint256 index) external view returns (
        address token, address curve, address creator, uint256 createdAt
    ) {
        TokenInfo memory info = tokens[index];
        return (info.token, info.curve, info.creator, info.createdAt);
    }

    function getTokenByAddress(address token) external view returns (
        address curve, address creator, uint256 createdAt, string memory metadataURI
    ) {
        TokenInfo memory info = tokenByAddress[token];
        return (info.curve, info.creator, info.createdAt, info.metadataURI);
    }
}
