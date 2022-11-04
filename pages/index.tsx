import React from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import type { NextPage } from 'next';
import { useProvider, useAccount, useNetwork } from 'wagmi';
import { ethers } from 'ethers';
import { Container, Loading, Spacer } from '@nextui-org/react';

import { FIAT, ZERO, WAD, decToWad, scaleToWad, wadToScale } from '@fiatdao/sdk';

import { ProxyCard } from '../src/ProxyCard';
import { CollateralTypesTable } from '../src/CollateralTypesTable';
import { PositionsTable } from '../src/PositionsTable';
import { CreatePositionModal } from '../src/CreatePositionModal';
import { ModifyPositionModal } from '../src/ModifyPositionModal';

import { decodeCollateralTypeId, getCollateralTypeData, decodePositionId, getPositionData, encodePositionId } from '../src/utils';

export type TransactionStatus = null | 'error' | 'sent' | 'confirming' | 'confirmed';

const Home: NextPage = () => {
  const provider = useProvider();
  const { connector } = useAccount({ onConnect: () => resetState(), onDisconnect: () => resetState() });
  const { chain } = useNetwork();


  const initialState = React.useMemo(() => ({
    setupListeners: false,
    contextData: {
      fiat: null as null | FIAT,
      explorerUrl: null as null | string,
      user: null as null | string,
      proxies: [] as Array<string>
    },
    positionsData: [] as Array<any>,
    collateralTypesData: [] as Array<any>,
    selectedPositionId: null as null | string,
    selectedCollateralTypeId: null as null | string,
    modifyPositionData: {
      outdated: false,
      collateralType: null as undefined | null | any,
      position: null as undefined | null | any,
      underlierAllowance: null as null | ethers.BigNumber, // [underlierScale]
      underlierBalance: null as null | ethers.BigNumber,
      monetaDelegate: null as null | boolean,
      fiatAllowance: null as null | ethers.BigNumber // [wad]
    },
    modifyPositionFormData: {
      outdated: true,
      mode: 'deposit', // [deposit, withdraw, redeem]
      slippagePct: decToWad('0.001') as ethers.BigNumber, // [wad]
      underlier: ZERO as ethers.BigNumber, // [underlierScale]
      deltaCollateral: ZERO as ethers.BigNumber, // [wad]
      deltaDebt: ZERO as ethers.BigNumber, // [wad]
      targetedHealthFactor: decToWad('1.2') as ethers.BigNumber, // [wad]
      collateral: ZERO as ethers.BigNumber, // [wad]
      debt: ZERO as ethers.BigNumber, // [wad]
      healthFactor: ZERO as ethers.BigNumber, // [wad]
      error: null as null | string
    },
    transactionData: {
      action: null as null | string,
      status: null as TransactionStatus, // error, sent, confirming, confirmed
    }
  }), []) 

  const [setupListeners, setSetupListeners] = React.useState(false);
  const [contextData, setContextData] = React.useState(initialState.contextData);
  const [collateralTypesData, setCollateralTypesData] = React.useState(initialState.collateralTypesData);
  const [positionsData, setPositionsData] = React.useState(initialState.positionsData);
  const [modifyPositionData, setModifyPositionData] = React.useState(initialState.modifyPositionData);
  const [modifyPositionFormData, setModifyPositionFormData] = React.useState(initialState.modifyPositionFormData);
  const [transactionData, setTransactionData] = React.useState(initialState.transactionData);
  const [selectedPositionId, setSelectedPositionId] = React.useState(initialState.selectedPositionId);
  const [selectedCollateralTypeId, setSelectedCollateralTypeId] = React.useState(initialState.selectedCollateralTypeId);

  const disableActions = React.useMemo(() => transactionData.status === 'sent', [transactionData.status])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  function resetState() {
    setSetupListeners(initialState.setupListeners);
    setContextData(initialState.contextData);
    setCollateralTypesData(initialState.collateralTypesData);
    setPositionsData(initialState.positionsData);
    setModifyPositionData(initialState.modifyPositionData);
    setModifyPositionFormData(initialState.modifyPositionFormData);
    setTransactionData(initialState.transactionData);
    setSelectedPositionId(initialState.selectedPositionId);
    setSelectedCollateralTypeId(initialState.selectedCollateralTypeId);
  }

  // Reset state if network or account changes
  React.useEffect(() => {
    if (!connector || setupListeners) return;
    connector.on('change', () => resetState());
    setSetupListeners(true);
  }, [setupListeners, connector, resetState]);

  // Fetch CollateralTypes and block explorer data
  React.useEffect(() => {
    if (collateralTypesData.length !== 0) return;

    (async function () {
      const fiat = await FIAT.fromProvider(provider, null);
      const collateralTypesData_ = await fiat.fetchCollateralTypesAndPrices([]);
      setCollateralTypesData(collateralTypesData_
        .filter((collateralType: any) => (collateralType.metadata != undefined))
        .sort((a: any, b: any) => {
          if (Number(a.properties.maturity) > Number(b.properties.maturity)) return -1;
          if (Number(a.properties.maturity) < Number(b.properties.maturity)) return 1;
          return 0;
        })
      );
      setContextData({
        ...contextData,
        explorerUrl: chain?.blockExplorers?.etherscan?.url || ''
      });
    })();
  }, [chain?.blockExplorers?.etherscan?.url, collateralTypesData.length, connector, contextData, provider]);

  // Fetch User and Vault data
  React.useEffect(() => {
    if (!connector || (contextData.user !== null && contextData.fiat != null)) return;
    
    (async function () {
      const signer = (await connector.getSigner());
      if (!signer || !signer.provider) return;
      const user = await signer.getAddress();
      const fiat = await FIAT.fromSigner(signer, undefined);
      const userData = await fiat.fetchUserData(user.toLowerCase());
      const positionsData = userData.flatMap((user) => user.positions);
      setPositionsData(positionsData);
      const proxies = userData.filter((user: any) => (user.isProxy === true)).map((user: any) => user.user);
      setContextData({
        ...contextData,
        fiat,
        user,
        proxies,
      });
    })();
  }, [connector, contextData]);

  // Populate ModifyPosition data
  React.useEffect(() => {
    if (
      !connector
      || modifyPositionData.collateralType !== null
      || (selectedCollateralTypeId == null && selectedPositionId == null)
    ) return;

    const { vault, tokenId } = decodeCollateralTypeId((selectedCollateralTypeId || selectedPositionId as string));
    const collateralType = getCollateralTypeData(collateralTypesData, vault, tokenId)

    let position;
    if (selectedPositionId) {
      const { owner } = decodePositionId(selectedPositionId);
      const matured = !(new Date() < (new Date(Number(collateralType.properties.maturity.toString()) * 1000)));
      setModifyPositionFormData({ ...modifyPositionFormData, mode: (matured) ? 'redeem' : 'deposit' });
      position = getPositionData(positionsData, vault, tokenId, owner);
    }
    const data = { ...modifyPositionData, collateralType, position };
    setModifyPositionData(data);

    (async function () {
      // For positions with proxies, fetch underlier balance, allowance, fiat allowance, and moneta delegation enablement
      if (contextData.proxies.length === 0) return;
      const { proxies: [proxy] } = contextData;
      if (
        !contextData.fiat ||
        data.collateralType == null ||
        (data.position &&
          data.position.owner.toLowerCase() !== proxy.toLowerCase())
      ) {
        return;
      }

      const { codex, moneta, fiat, vaultEPTActions } = contextData.fiat.getContracts();
      const underlier = contextData.fiat.getERC20Contract(data.collateralType.properties.underlierToken);

      const signer = (await connector.getSigner());
      if (!signer || !signer.provider) return;
      const user = await signer.getAddress();
      const [underlierAllowance, underlierBalance, monetaDelegate, fiatAllowance] = await contextData.fiat.multicall([
        { contract: underlier, method: 'allowance', args: [proxy, vaultEPTActions.address] },
        { contract: underlier, method: 'balanceOf', args: [user] },
        { contract: codex, method: 'delegates', args: [proxy, moneta.address] },
        { contract: fiat, method: 'allowance', args: [proxy, vaultEPTActions.address] }
      ]);
      setModifyPositionData({ ...modifyPositionData, ...data, underlierAllowance, underlierBalance, monetaDelegate, fiatAllowance });
    })();
  }, [
    connector,
    contextData,
    collateralTypesData,
    positionsData,
    selectedCollateralTypeId,
    selectedPositionId,
    modifyPositionData,
    modifyPositionFormData
  ]);

  // Update ModifyPosition form data
  React.useEffect(() => {
    // TODO: might have to swap for userReducer NOW.
    // or implement a debounce/use zustand if it's calling a certain rpc method
    if (
      !connector
      || modifyPositionData.collateralType == null
      || (selectedCollateralTypeId == null && selectedPositionId == null)
      || modifyPositionFormData.outdated === false
    ) return;


    const timeOutId = setTimeout(() => {
      (async function () {
        if (!contextData.fiat) return
        const { collateralType, position } = modifyPositionData;
        const { mode } = modifyPositionFormData;
        const { vault, tokenId, tokenScale, vaultType } = collateralType.properties;
        const { codex: { virtualRate: rate }, collybus: { liquidationPrice } } = collateralType.state;
        const { fiat } = contextData;
        const { vaultEPTActions, vaultFCActions, vaultFYActions } = fiat.getContracts();

        try {
          if (mode === 'deposit') {
            const { underlier } = modifyPositionFormData;
            let tokensOut = ethers.constants.Zero;
            if (vaultType === 'ERC20:EPT' && underlier.gt(ZERO)) {
              if (collateralType.properties.eptData == undefined) throw new Error('Missing data');
              const { eptData: { balancerVault: balancer, poolId: pool } } = collateralType.properties;
              tokensOut = await fiat.call(vaultEPTActions, 'underlierToPToken', vault, balancer, pool, underlier);
            } else if (vaultType === 'ERC1155:FC' && underlier.gt(ZERO)) {
              if (collateralType.properties.fcData == undefined) throw new Error('Missing data');
              tokensOut = await fiat.call(vaultFCActions, 'underlierToFCash', tokenId, underlier);
            } else if (vaultType === 'ERC20:FY' && underlier.gt(ZERO)) {
              if (collateralType.properties.fyData == undefined) throw new Error('Missing data');
              const { fyData: { yieldSpacePool } } = collateralType.properties;
              tokensOut = await fiat.call(vaultFYActions, 'underlierToFYToken', underlier, yieldSpacePool);
            } else if (underlier.gt(ZERO)) { throw new Error('Unsupported collateral type'); }
            const { slippagePct } = modifyPositionFormData;
            const deltaCollateral = scaleToWad(tokensOut, tokenScale).mul(WAD.sub(slippagePct)).div(WAD);
            if (selectedCollateralTypeId !== null) {
              const { targetedHealthFactor } = modifyPositionFormData;
              const deltaNormalDebt = fiat.computeMaxNormalDebt(
                deltaCollateral, targetedHealthFactor, rate, liquidationPrice
              );
              const deltaDebt = fiat.normalDebtToDebt(deltaNormalDebt, rate);
              const collateral = deltaCollateral;
              const debt = deltaDebt;
              const healthFactor = fiat.computeHealthFactor(collateral, deltaNormalDebt, rate, liquidationPrice);
              if (healthFactor.lte(WAD)) throw new Error('Health factor has to be greater than 1.0');
              setModifyPositionFormData({
                ...modifyPositionFormData, healthFactor, collateral, debt, deltaCollateral, outdated: false
              });
            } else {
              const { deltaDebt } = modifyPositionFormData;
              const normalDebt = fiat.debtToNormalDebt(deltaDebt, rate);
              const collateral = position.collateral.add(deltaCollateral);
              const debt = fiat.normalDebtToDebt(position.normalDebt, rate).add(deltaDebt);
              const healthFactor = fiat.computeHealthFactor(collateral, normalDebt, rate, liquidationPrice);
              if (healthFactor.lte(WAD)) throw new Error('Health factor has to be greater than 1.0');
              setModifyPositionFormData({
                ...modifyPositionFormData, healthFactor, collateral, debt, deltaCollateral, outdated: false
              });
            }
          } else if (mode === 'withdraw') {
            const { deltaCollateral, deltaDebt, slippagePct } = modifyPositionFormData;
            const tokenIn = wadToScale(deltaCollateral, tokenScale);
            let underlierAmount = ethers.constants.Zero;
            if (vaultType === 'ERC20:EPT' && tokenIn.gt(ZERO)) {
              if (collateralType.properties.eptData == undefined) throw new Error('Missing data');
              const { eptData: { balancerVault: balancer, poolId: pool } } = collateralType.properties;
              underlierAmount = await fiat.call(vaultEPTActions, 'pTokenToUnderlier', vault, balancer, pool, tokenIn);
            } else if (vaultType === 'ERC1155:FC' && tokenIn.gt(ZERO)) {
              if (collateralType.properties.fcData == undefined) throw new Error('Missing data');
              underlierAmount = await fiat.call(vaultFCActions, 'fCashToUnderlier', tokenId, tokenIn);
            } else if (vaultType === 'ERC20:FY' && tokenIn.gt(ZERO)) {
              if (collateralType.properties.fyData == undefined) throw new Error('Missing data');
              const { fyData: { yieldSpacePool } } = collateralType.properties;
              underlierAmount = await fiat.call(vaultFYActions, 'fyTokenToUnderlier', tokenIn, yieldSpacePool);
            } else if (tokenIn.gt(ZERO)) { throw new Error('Unsupported collateral type'); }
            const underlier = underlierAmount.mul(WAD.sub(slippagePct)).div(WAD);
            const deltaNormalDebt = fiat.debtToNormalDebt(deltaDebt, rate);
            if (position.collateral.lt(deltaCollateral)) throw new Error('Insufficient collateral');
            if (position.normalDebt.lt(deltaNormalDebt)) throw new Error('Insufficient debt');
            const collateral = position.collateral.sub(deltaCollateral);
            const normalDebt = position.normalDebt.sub(deltaNormalDebt);
            const debt = fiat.normalDebtToDebt(normalDebt, rate);
            const healthFactor = fiat.computeHealthFactor(collateral, normalDebt, rate, liquidationPrice);
            if (healthFactor.lte(WAD)) throw new Error('Health factor has to be greater than 1.0');
            setModifyPositionFormData({
              ...modifyPositionFormData, healthFactor, underlier, collateral, debt, outdated: false
            });
          } else if (mode === 'redeem') {
            const { deltaCollateral, deltaDebt } = modifyPositionFormData;
            const deltaNormalDebt = fiat.debtToNormalDebt(deltaDebt, rate);
            if (position.collateral.lt(deltaCollateral)) throw new Error('Insufficient collateral');
            if (position.normalDebt.lt(deltaNormalDebt)) throw new Error('Insufficient debt');
            const collateral = position.collateral.sub(deltaCollateral);
            const normalDebt = position.normalDebt.sub(deltaNormalDebt);
            const debt = fiat.normalDebtToDebt(normalDebt, rate);
            const healthFactor = fiat.computeHealthFactor(collateral, normalDebt, rate, liquidationPrice);
            if (healthFactor.lte(WAD)) throw new Error('Health factor has to be greater than 1.0');
            setModifyPositionFormData({
              ...modifyPositionFormData, healthFactor, collateral, debt, outdated: false,
            });
          } else { throw new Error('Invalid mode'); }
        } catch (error) {
          console.log(error);
          if (mode === 'deposit') {
            setModifyPositionFormData({
              ...modifyPositionFormData,
              underlier: modifyPositionFormData.underlier,
              deltaCollateral: ZERO,
              deltaDebt: ZERO,
              collateral: ZERO,
              debt: ZERO,
              healthFactor: ZERO,
              outdated: false,
              error: JSON.stringify(error)
            });
          } else if (mode === 'withdraw' || mode === 'redeem') {
            setModifyPositionFormData({
              ...modifyPositionFormData,
              underlier: ZERO,
              deltaCollateral: modifyPositionFormData.underlier,
              deltaDebt: modifyPositionFormData.deltaDebt,
              collateral: ZERO,
              debt: ZERO,
              healthFactor: ZERO,
              outdated: false,
              error: JSON.stringify(error)
            });
          }
        }
      })();
    }, 2000);
    // prevent timeout callback from executing if useEffect was interrupted by a rerender
    return () => clearTimeout(timeOutId)
  }, [
    connector,
    initialState,
    contextData,
    selectedCollateralTypeId,
    selectedPositionId,
    modifyPositionData,
    modifyPositionFormData
  ]);

  // Transaction methods
  React.useEffect(() => {
    if (
      !connector
      || contextData.fiat == null
      || transactionData.action == null
      || transactionData.status === 'sent'
    ) return;

    setTransactionData({ ...transactionData, status: 'sent' });
    const { action } = transactionData;

    (async function () {
      if (!contextData.fiat) return;

      try {
        const {
          proxyRegistry, codex, moneta, vaultEPTActions, vaultFCActions, vaultFYActions
        } = contextData.fiat.getContracts();

        if (contextData.proxies.length === 0 || contextData.user === null) return;

        // if (action == 'setupProxy') {
        //   const resp = await contextData.fiat.dryrun(proxyRegistry, 'deployFor', contextData.user);
        //   console.log('resp', resp)
        // }

        // TODO: these next. then react querify calls in the modal. then the next thing
        if (action == 'setUnderlierAllowance') {
          const token = contextData.fiat.getERC20Contract(modifyPositionData.collateralType.properties.underlierToken);
          console.log(await contextData.fiat.dryrun(
            token, 'approve', contextData.proxies[0], modifyPositionFormData.underlier
          ));
        }

        if (action == 'unsetUnderlierAllowance') {
          const token = contextData.fiat.getERC20Contract(modifyPositionData.collateralType.properties.underlierToken);
          console.log(await contextData.fiat.dryrun(token, 'approve', contextData.proxies[0], 0));
        }

        if (action == 'setMonetaDelegate') {
          console.log(await contextData.fiat.dryrun(codex, 'grantDelegate', moneta.address));
        }

        if (action == 'unsetMonetaDelegate') {
          console.log(await contextData.fiat.dryrun(codex, 'revokeDelegate', moneta.address));
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(error);
      }
      setTransactionData({ ...transactionData, action: null, status: null });
    })();
  }, [connector, contextData.fiat, contextData.proxies, contextData.user, modifyPositionData, modifyPositionFormData, transactionData]);

  if (collateralTypesData.length === 0) {
    return (
      <Loading style={{ marginTop: '50vh', width: '100vw', height: '100vh' }}/>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: 12 }}>
        <h4 style={{ justifyContent: 'flex',  }}>Experimental FIAT UI</h4>
        <ConnectButton showBalance={false} />
      </div>
      <Spacer y={2} />
      <Container>
        {contextData.user === null || contextData.fiat === null ? null : (
          <ProxyCard
            {...contextData}
            setTransactionStatus={(status) =>
              setTransactionData({ ...transactionData, status })
            }
          />
        )}
      </Container>
      <Spacer y={2} />
      <Container>
        <CollateralTypesTable
          collateralTypesData={collateralTypesData}
          onSelectCollateralType={(collateralTypeId) => {
            // Attempt to find existing position for a given collateral
            // If it exists, open the ModifyPositionModal modal instead of CreatePositionModal
            // by setting selectedPositionId rather than selectedCollateralTypeId
            const { vault, tokenId } = decodeCollateralTypeId(collateralTypeId);
            const foundPosition = getPositionData(positionsData, vault, tokenId, contextData.proxies[0]);
            if (foundPosition !== undefined) {
              const positionId = encodePositionId(
                vault,
                tokenId,
                foundPosition.owner
              );
              setSelectedPositionId(positionId);
              setSelectedCollateralTypeId(
                initialState.selectedCollateralTypeId
              );
            } else {
              // If no position for this collateralType was found, open CreatePositionModal like normal
              setSelectedPositionId(initialState.selectedPositionId);
              setSelectedCollateralTypeId(collateralTypeId);
            }
          }}
        />
      </Container>
      <Spacer y={2} />
      <Container>
        {
          positionsData === null || positionsData.length === 0
            ? null
            : (
              <PositionsTable
                collateralTypesData={collateralTypesData}
                positionsData={positionsData}
                onSelectPosition={(positionId) => {
                  setSelectedPositionId(positionId);
                  setSelectedCollateralTypeId(initialState.selectedCollateralTypeId);
                }}
              />
            )
        }
      </Container>

      <CreatePositionModal
        contextData={contextData}
        disableActions={disableActions}
        modifyPositionData={modifyPositionData}
        modifyPositionFormData={modifyPositionFormData}
        setTransactionStatus={(status) =>
          setTransactionData({ ...transactionData, status })
        }
        transactionData={transactionData}
        onUpdateUnderlier={(underlier) => {
          if (underlier === null) {
            const { underlier, targetedHealthFactor, slippagePct } = modifyPositionFormData;
            setModifyPositionFormData({ 
              ...initialState.modifyPositionFormData, underlier, targetedHealthFactor, slippagePct, outdated: false
            });  
          } else {
            setModifyPositionFormData({ ...modifyPositionFormData, underlier, outdated: true });
          }
        }}
        onUpdateSlippage={(slippagePct) => {
          if (slippagePct === null) {
            const { slippagePct, targetedHealthFactor, underlier } = modifyPositionFormData;
            setModifyPositionFormData({ 
              ...initialState.modifyPositionFormData, slippagePct, targetedHealthFactor, underlier, outdated: false
            }); 
          } else {
            setModifyPositionFormData({ ...modifyPositionFormData, slippagePct, outdated: true });
          }
        }}
        onUpdateTargetedHealthFactor={(targetedHealthFactor) => {
          if (targetedHealthFactor === null) {
            const { underlier, slippagePct, targetedHealthFactor } = modifyPositionFormData;
            setModifyPositionFormData({ 
              ...initialState.modifyPositionFormData, underlier, slippagePct, targetedHealthFactor, outdated: false
            }); 
          } else {
            setModifyPositionFormData({ ...modifyPositionFormData, targetedHealthFactor, outdated: true });
          }
        }}
        onSendTransaction={(action) => setTransactionData({ ...transactionData, action })}
        open={(!!selectedCollateralTypeId)}
        onClose={() => {
          setSelectedCollateralTypeId(initialState.selectedCollateralTypeId);
          setModifyPositionData(initialState.modifyPositionData);
          setModifyPositionFormData(initialState.modifyPositionFormData);
        }}
      />

      <ModifyPositionModal
        contextData={contextData}
        disableActions={disableActions}
        modifyPositionData={modifyPositionData}
        modifyPositionFormData={modifyPositionFormData}
        setTransactionStatus={(status) =>
          setTransactionData({ ...transactionData, status })
        }
        transactionData={transactionData}
        onUpdateDeltaCollateral={(deltaCollateral) => {
          if (deltaCollateral === null) {
            const { deltaCollateral, deltaDebt, slippagePct, mode } = modifyPositionFormData;
            setModifyPositionFormData({ 
              ...initialState.modifyPositionFormData, deltaCollateral, deltaDebt, slippagePct, mode, outdated: false
            });  
          } else {
            setModifyPositionFormData({ ...modifyPositionFormData, deltaCollateral, outdated: true });
          }
        }}
        onUpdateDeltaDebt={(deltaDebt) => {
          if (deltaDebt === null) {
            const { deltaCollateral, deltaDebt, slippagePct, mode } = modifyPositionFormData;
            setModifyPositionFormData({ 
              ...initialState.modifyPositionFormData, deltaCollateral, deltaDebt, slippagePct, mode, outdated: false
            });  
          } else {
            setModifyPositionFormData({ ...modifyPositionFormData, deltaDebt, outdated: true });
          }
        }}
        onUpdateUnderlier={(underlier) => {
          if (underlier === null) {
            const { underlier, deltaDebt, slippagePct, mode } = modifyPositionFormData;
            setModifyPositionFormData({ 
              ...initialState.modifyPositionFormData, underlier, deltaDebt, slippagePct, mode, outdated: false
            });  
          } else {
            setModifyPositionFormData({ ...modifyPositionFormData, underlier, outdated: true });
          }
        }}
        onUpdateSlippage={(slippagePct) => {
          if (slippagePct === null) {
            const { slippagePct, underlier, deltaCollateral, deltaDebt, mode } = modifyPositionFormData;
            if (modifyPositionFormData.mode === 'deposit') {
              setModifyPositionFormData({ 
                ...initialState.modifyPositionFormData, slippagePct, deltaDebt, underlier, mode, outdated: false,
              }); 
            } else {
              setModifyPositionFormData({ 
                ...initialState.modifyPositionFormData, slippagePct, deltaDebt, deltaCollateral, mode, outdated: false,
              }); 
            }
          } else {
            setModifyPositionFormData({ ...modifyPositionFormData, slippagePct, outdated: true });
          }
        }}
        onUpdateMode={(mode) => {
          setModifyPositionFormData({  ...initialState.modifyPositionFormData, mode, outdated: false }); 
        }}
        onSendTransaction={(action) => setTransactionData({ ...transactionData, action })}
        open={(!!selectedPositionId)}
        onClose={() => {
          setSelectedPositionId(initialState.selectedCollateralTypeId);
          setModifyPositionData(initialState.modifyPositionData);
          setModifyPositionFormData(initialState.modifyPositionFormData);
        }}
      />
      <Spacer />
    </div>
  );
};

export default Home;
