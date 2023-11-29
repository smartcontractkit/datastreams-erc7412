// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Common} from "@chainlink/contracts/src/v0.8/libraries/Common.sol";

interface IFeeManager {
    function getFeeAndReward(
        address subscriber,
        bytes memory report,
        address quoteAddress
    ) external returns (Common.Asset memory, Common.Asset memory, uint256);

    function i_linkAddress() external view returns (address);

    function i_nativeAddress() external view returns (address);

    function i_rewardManager() external view returns (address);
}
