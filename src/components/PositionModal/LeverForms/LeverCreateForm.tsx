import { decToScale, interestPerSecondToAnnualYield, scaleToDec, wadToDec, ZERO } from '@fiatdao/sdk';
import { Button, Card, Grid, Input, Loading, Modal, Row, Spacer, Switch, Text, Tooltip } from '@nextui-org/react';
import { BigNumber, ethers } from 'ethers';
import React, { useCallback, useMemo } from 'react';
import 'katex/dist/katex.min.css';
import { InlineMath } from 'react-katex';
import shallow from 'zustand/shallow';
import useStore from '../../../state/stores/globalStore';
import { useLeverStore } from '../../../state/stores/leverStore';
import { commifyToDecimalPlaces, floor2, floor4 } from '../../../utils';
import { Alert } from '../../Alert';
import { NumericInput } from '../../NumericInput/NumericInput';
import { Slider } from '../../Slider/Slider';
import { useSetUnderlierAllowanceForProxy, useUnsetUnderlierAllowanceForProxy } from '../../../hooks/useSetAllowance';
import { buildBuyCollateralAndIncreaseLeverArgs, sendTransaction } from '../../../actions';
import { useAddRecentTransaction } from '@rainbow-me/rainbowkit';
import { chain as chains, useAccount, useNetwork } from 'wagmi';
import useSoftReset from '../../../hooks/useSoftReset';
import { useUserData } from '../../../state/queries/useUserData';

const LeverCreateForm = ({
  onClose,
}: {
  onClose: () => void,
}) => {
  const leverStore = useLeverStore(
    React.useCallback(
      (state) => ({
        createState: state.createState,
        createActions: state.createActions,
        formDataLoading: state.formDataLoading,
        formWarnings: state.formWarnings,
        formErrors: state.formErrors,
      }),
      []
    ), shallow
  );

  const fiat = useStore(state => state.fiat);
  const user = useStore((state) => state.user);
  const hasProxy = useStore(state => state.hasProxy);
  const disableActions = useStore((state) => state.disableActions);
  const transactionData = useStore((state => state.transactionData));
  const modifyPositionData = useStore((state) => state.modifyPositionData);

  const setUnderlierAllowanceForProxy = useSetUnderlierAllowanceForProxy();
  const unsetUnderlierAllowanceForProxy = useUnsetUnderlierAllowanceForProxy();

  const addRecentTransaction = useAddRecentTransaction();
  const { chain } = useNetwork();
  const { address } = useAccount();
  const softReset = useSoftReset();

  const { data: userData } = useUserData(fiat, chain?.id ?? chains.mainnet.id, address ?? '');
  const { proxies } = userData as any;
  
  const createLeveredPosition = useCallback(async (
    upFrontUnderlier: BigNumber, addDebt: BigNumber, minUnderlierToBuy: BigNumber, minTokenToBuy: BigNumber
  ) => {
    const args = await buildBuyCollateralAndIncreaseLeverArgs(
      fiat, user, proxies, modifyPositionData.collateralType, upFrontUnderlier, addDebt, minUnderlierToBuy, minTokenToBuy
    );
    const response = await sendTransaction(
      fiat, true, proxies[0], 'createLeveredPosition', args.contract, args.methodName, ...args.methodArgs
    );
    addRecentTransaction({ hash: response.transactionHash, description: 'Create levered position' });
    softReset();
  }, [addRecentTransaction, fiat, modifyPositionData.collateralType, proxies, softReset, user]);

  const [submitError, setSubmitError] = React.useState('');

  const {
    collateralType: {
      metadata: { symbol: tokenSymbol },
      properties: { underlierScale, underlierSymbol, tokenScale },
      state: { publican: { interestPerSecond } }
    },
    underlierAllowance,
    underlierBalance,
    monetaDelegate,
  } = modifyPositionData;
  const {
    upFrontUnderliersStr, collateralSlippagePctStr, underlierSlippagePctStr, targetedCollRatio,
    addDebt, minUnderliersToBuy, minTokenToBuy, 
    collateral, collRatio, debt, leveragedGain, leveragedAPY, minCollRatio, maxCollRatio
  } = leverStore.createState;
  const {
    setUpFrontUnderliers, setCollateralSlippagePct, setUnderlierSlippagePct, setTargetedCollRatio
  } = leverStore.createActions;
  const { action: currentTxAction } = transactionData;

  const upFrontUnderliers = useMemo(() => (
    (leverStore.createState.upFrontUnderliersStr === '')
      ? ZERO : decToScale(leverStore.createState.upFrontUnderliersStr, underlierScale)
  ), [leverStore.createState.upFrontUnderliersStr, underlierScale])

  const renderFormAlerts = () => {
    const formAlerts = [];

    if (!hasProxy) {
      formAlerts.push(
        <Alert
          severity='warning'
          message={`Creating positions requires a Proxy. Please close this modal and click "Create Proxy Account" in
            the top bar.
          `}
          key={'warn-needsProxy'}
        />
      );
    }

    if (leverStore.formWarnings.length !== 0) {
      leverStore.formWarnings.map((formWarning, idx) => {
        formAlerts.push(<Alert severity='warning' message={formWarning} key={`warn-${idx}`} />);
      });
    }

    if (leverStore.formErrors.length !== 0) {
      leverStore.formErrors.forEach((formError, idx) => {
        formAlerts.push(<Alert severity='error' message={formError} key={`err-${idx}`} />);
      });
    }

    if (submitError !== '' && submitError !== 'ACTION_REJECTED' ) {
      formAlerts.push(<Alert severity='error' message={submitError} key={'error-submit'}/>);
    }

    return formAlerts;
  }

  if (
    !modifyPositionData.collateralType ||
    !modifyPositionData.collateralType.metadata
  ) {
    // TODO: add skeleton components instead of loading
    return null;
  }

  return (
    <>
      <Modal.Body>
        <Text b size={'m'}>Inputs</Text>
        {underlierBalance && (
          <Text size={'$sm'}>
            Available:{' '}
            {commifyToDecimalPlaces(underlierBalance, underlierScale, 2)}{' '}
            {underlierSymbol}
          </Text>
        )}
        <NumericInput
          disabled={disableActions}
          value={upFrontUnderliersStr}
          onChange={(event) => { setUpFrontUnderliers(fiat, event.target.value, modifyPositionData) }}
          placeholder='0'
          label={
            <Tooltip
              css={{ zIndex: 10000, width: 250 }}
              color='primary'
              content={`The amount of ${underlierSymbol} to swap in addition to the flash-lent amount of FIAT
                for ${tokenSymbol}. This determines the resulting collateralization ratio of the levered position.
                The more underliers are provided upfront, the higher (safer) the collateralization ratio will be.
              `}
            >
              Upfront underliers
            </Tooltip>
          }
          rightAdornment={underlierSymbol}
        />
        <Grid.Container
          gap={0}
          justify='space-between'
          css={{ marginBottom: '1rem' }}
        >
          <Grid>
            <NumericInput
              disabled={disableActions}
              value={underlierSlippagePctStr}
              onChange={(event) => { setUnderlierSlippagePct(fiat, event.target.value, modifyPositionData) }}
              step='0.01'
              placeholder='0.01'
              label={
                <Tooltip
                  css={{ zIndex: 10000, width: 250 }}
                  color='primary'
                  content={`The maximum allowed slippage (in percentage) when swapping the flash-lent FIAT
                    for ${underlierSymbol}. The transaction will revert if the amount of ${underlierSymbol} diverges
                    by more (in percentages) than the provided slippage amount.
                  `}
                >
                  Slippage<br/>(FIAT → Underlier)
                </Tooltip>
              }
              rightAdornment={'%'}
              style={{ width: '11.0rem' }}
            />
          </Grid>
          <Grid>
            <NumericInput
              disabled={disableActions}
              value={collateralSlippagePctStr}
              onChange={(event) => { setCollateralSlippagePct(fiat, event.target.value, modifyPositionData) }}
              step='0.01'
              placeholder='0.01'
              label={
                <Tooltip
                  css={{ zIndex: 10000, width: 250 }}
                  color='primary'
                  content={`The maximum allowed slippage (in percentage) when swapping the bought ${underlierSymbol}
                    for ${tokenSymbol}. The transaction will revert if the amount of ${tokenSymbol} diverges by more
                    (in percentages) than the provided slippage amount.
                  `}
                >
                  Slippage<br/>(Underlier → Collateral Asset)
                </Tooltip>
              }
              rightAdornment={'%'}
              style={{ width: '11.0rem' }}
            />
          </Grid>
        </Grid.Container>
        {(!minCollRatio.isZero() && !maxCollRatio.isZero() && !minCollRatio.eq(maxCollRatio)) && (
          <>
            <Tooltip
              css={{ zIndex: 10000, width: 250 }}
              color='primary'
              content={`The targeted collateralization ratio of the levered position.
                Note: The actual collateralization ratio can diverge slightly from the targeted value
                (see Position Preview).
              `}
              style={{ paddingLeft: '0.25rem', marginBottom: '0.375rem' }}
            >
              <Text size={'0.75rem'}>
                Targeted collateralization ratio ({floor2(wadToDec(targetedCollRatio.mul(100)))}%)
              </Text>
            </Tooltip>
            <Card variant='bordered' borderWeight='light' style={{height:'100%'}}>
              <Card.Body
                style={{ paddingLeft: '2.25rem', paddingRight: '2.25rem', overflow: 'hidden' }}
              >
                <Slider
                  aria-label={'Targeted Collateralization Ratio'}
                  color='gradient'
                  disabled={disableActions}
                  inverted
                  max={(maxCollRatio.eq(ethers.constants.MaxUint256)) ? 5.0 : floor4(wadToDec(maxCollRatio))}
                  maxLabel={'Safer'}
                  min={floor4(wadToDec(minCollRatio))}
                  minLabel={'Riskier'}
                  onValueChange={(value) => { setTargetedCollRatio(fiat, Number(value), modifyPositionData) }}
                  step={0.001}
                  value={[Number(wadToDec(targetedCollRatio))]}
                />
              </Card.Body>
            </Card>
          </>
        )}
        <Text size={'$sm'}>
          Note: Third-party swap fees are due on the total position amounts.
          Withdrawing collateral before maturity may result in a loss.
        </Text>
      </Modal.Body>
      <Spacer y={0.75} />
      <Card.Divider />
      <Modal.Body>
        <Spacer y={0} />
        <Text b size={'m'}>Leveraged Swap Preview</Text>
        <Input
          readOnly
          value={(leverStore.formDataLoading)
            ? ' '
            : `${floor2(scaleToDec(minTokenToBuy, tokenScale))}`
          }
          placeholder='0'
          type='string'
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          label={
            <Tooltip
              css={{ zIndex: 10000, width: 250 }}
              color='primary'
              content={`The total amount of the collateral asset that is bought via the upfront underliers and the
                flash-lent FIAT. This estimate accounts for slippage and price impact.`
              }
            >
              Total Collateral to deposit (incl. slippage)
            </Tooltip>
          }
          labelRight={tokenSymbol}
          contentLeft={leverStore.formDataLoading ? <Loading size='xs' /> : null}
          size='sm'
          status='primary'
        />
        <Input
          readOnly
          value={(leverStore.formDataLoading)
            ? ' '
            : `${floor2(wadToDec(leveragedGain))} (${floor2(wadToDec(leveragedAPY.mul(100)))}% APY)`
          }
          placeholder='0'
          type='string'
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          label={
            <Tooltip
              css={{ zIndex: 10000, width: 250 }}
              color='primary'
              content={`The implied gain of the collateral asset at maturity.
                This estimate accounts for the due borrow fees and assumes a fixed price of FIAT of 1 USD at maturity.
                Note: Borrow fees, the price impact and the price of FIAT might be different
                at maturity. For larger input amounts the resulting gain can be negative due to large price impacts or
                low liquidity.
              `}
            >
              Estimated net gain at maturity 
              (incl. {floor2(Number(wadToDec(interestPerSecondToAnnualYield(interestPerSecond))) * 100)}% borrow fee)
            </Tooltip>
          }
          labelRight={underlierSymbol}
          contentLeft={leverStore.formDataLoading ? <Loading size='xs' /> : null}
          size='sm'
          status='primary'
        />
      </Modal.Body>
      <Spacer y={0.75} />
      <Card.Divider />
      <Modal.Body>
        <Spacer y={0} />
        <Text b size={'m'}>Position Preview</Text>
        <Input
          readOnly
          value={(leverStore.formDataLoading)
            ? ' '
            : `${floor2(wadToDec(collateral))}`
          }
          placeholder='0'
          type='string'
          label={'Collateral (incl. slippage)'}
          labelRight={tokenSymbol}
          contentLeft={(leverStore.formDataLoading) ? <Loading size='xs' /> : null}
          size='sm'
          status='primary'
        />
        <Input
          readOnly
          value={(leverStore.formDataLoading) ? ' ' : floor2(wadToDec(debt))}
          placeholder='0'
          type='string'
          label='Debt (incl. slippage)'
          labelRight={'FIAT'}
          contentLeft={(leverStore.formDataLoading) ? <Loading size='xs' /> : null}
          size='sm'
          status='primary'
        />
        <Input
          readOnly
          value={
            (leverStore.formDataLoading)
              ? ' '
              : `${floor2(wadToDec(collRatio.mul(100)))}%`
          }
          placeholder='0'
          type='string'
          // label='Collateralization Ratio (incl. slippage)'
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          label={
            <Tooltip
              css={{ zIndex: 10000, width: 250 }}
              color='primary'
              content={
                <>
                  The collateralization ratio is the ratio of the value of the collateral (fair price) divided by the
                  outstanding debt (FIAT) drawn against it. The fair price is derived from the spot price of the
                  underlier denominated in USD and a discounting model that the protocol applies for accounting for the
                  time value of money of the fixed term asset.
                  <br />
                  The following formula is used:
                  <InlineMath math="\text{collRatio} = \frac{\text{collateral}*\text{fairPrice}}{\text{debt}}"/>
                  <br />
                </>
              }
            >
              Collateralization Ratio (incl. slippage)
            </Tooltip>
          }
          labelRight={'🚦'}
          contentLeft={(leverStore.formDataLoading) ? <Loading size='xs' /> : null}
          size='sm'
          status='primary'
        />

        {/* renderSummary() */}

      </Modal.Body>
      <Modal.Footer justify='space-evenly'>
        <Card variant='bordered'>
          <Card.Body>
          <Row justify='flex-start'>
            <Switch
              disabled={disableActions || !hasProxy}
              // Next UI Switch `checked` type is wrong, this is necessary
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              checked={() => underlierAllowance?.gt(0) && underlierAllowance?.gte(upFrontUnderliers) ?? false}
              onChange={async () => {
                if (!upFrontUnderliers.isZero() && underlierAllowance?.gte(upFrontUnderliers)) {
                  try {
                    setSubmitError('');
                    await unsetUnderlierAllowanceForProxy();
                  } catch (e: any) {
                    setSubmitError(e.message);
                  }
                } else {
                  try {
                    setSubmitError('');
                    await setUnderlierAllowanceForProxy(upFrontUnderliers);
                  } catch (e: any) {
                    setSubmitError(e.message);
                  }
                }
              }}
              color='primary'
              icon={
                (
                  ['setUnderlierAllowanceForProxy', 'unsetUnderlierAllowanceForProxy'].includes(currentTxAction || '')
                  && disableActions
                ) ? (
                  <Loading size='xs' />
              ) : null
              }
            />
            <Spacer x={0.5} />
            <Text>Allow <code>FIAT I</code> to transfer your {underlierSymbol}</Text>
          </Row>
          </Card.Body>
        </Card>
        <Spacer y={0.5} />
        { renderFormAlerts() }
        <Button
          css={{ minWidth: '100%' }}
          disabled={
            leverStore.formErrors.length !== 0 ||
            leverStore.formWarnings.length !== 0 ||
            disableActions ||
            !hasProxy ||
            upFrontUnderliers?.isZero() ||
            minTokenToBuy?.isZero() ||
            underlierAllowance?.lt(upFrontUnderliers) ||
            monetaDelegate === false
          }
          icon={(disableActions && currentTxAction === 'createLeveredPosition') ? (<Loading size='xs' />) : null}
          onPress={async () => {
            try {
              setSubmitError('');
              await createLeveredPosition(upFrontUnderliers, addDebt, minUnderliersToBuy, minTokenToBuy);
              onClose();
            } catch (e: any) {
              setSubmitError(e.message);
            }
          }}
        >
          Deposit
        </Button>
      </Modal.Footer>
    </>
  );
}


export default LeverCreateForm;
