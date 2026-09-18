// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract AevonToken is ERC20 {
    address public immutable factory;

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_,
        address bondingCurve_
    ) ERC20(name_, symbol_) {
        factory = msg.sender;
        _mint(bondingCurve_, totalSupply_);
    }
}
