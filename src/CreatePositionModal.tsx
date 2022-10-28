import React from 'react';
import { Text, Spacer, Card, Button, Modal, Navbar, Grid, Input, Loading, Switch } from '@nextui-org/react';
import { BigNumber, ethers } from 'ethers';
import { Slider } from 'antd';
import 'antd/dist/antd.css';
// @ts-ignore
import { decToScale, decToWad, scaleToDec, wadToDec } from '@fiatdao/sdk';

import { formatUnixTimestamp, floor2, floor4 } from './utils';

interface CreatePositionModalProps {
  contextData: any,
  modifyPositionData: any,
  modifyPositionFormData: any,
  transactionData: any,
  onUpdateUnderlier: (underlier: null | ethers.BigNumber) => void,
  onUpdateSlippage: (slippagePct: null | ethers.BigNumber) => void,
  onUpdateTargetedHealthFactor: (targetedHealthFactor: null | ethers.BigNumber) => void,
  onSendTransaction: (action: string) => void,
  open: boolean,
  onClose: () => void
}

export const CreatePositionModal = (props: CreatePositionModalProps) => {

  const disableActions = (props.transactionData.status === 'sent');

  // TODO: remove this from here, use in the sdk
  const convertToHumanReadableValue = (
    value: BigNumber,
    scale: number
  ): string => {
    const parts = ethers?.utils
      .commify(scaleToDec(value, scale))
      .toString()
      .split(".");
    return parts[0] + "." + parts[1].slice(0, 2);
  };
  
  return (
    <Modal preventClose closeButton={!disableActions} blur open={props.open} onClose={() => props.onClose()}>
      {(props.contextData.user && props.modifyPositionData.collateralType) && ((() => {
        const { proxies } = props.contextData;
        const {
          collateralType: {
            metadata: { symbol: tokenSymbol, protocol, asset },
            properties: { underlierScale, underlierSymbol, maturity }
          },
          underlierAllowance,
          underlierBalance,
          monetaDelegate
        } = props.modifyPositionData;
        const {
          outdated, underlier, slippagePct, targetedHealthFactor, deltaCollateral, collateral, debt, healthFactor
        } = props.modifyPositionFormData;
        const { action: currentTxAction } = props.transactionData;
      
        const hasProxy = (proxies.length > 0);

        return (
          <>
            <Modal.Header>
              <Text id='modal-title' size={18}>
                <Text b size={18}>Create Position</Text>
                <br/>
                <Text b size={16}>{`${protocol} - ${asset}`}</Text>
                <br/>
                <Text b size={14}>{`${formatUnixTimestamp(maturity)}`}</Text>
              </Text>
            </Modal.Header>
            <Modal.Body>
              <Navbar
                variant='static' isCompact disableShadow disableBlur
                containerCss={{justifyContent: 'center', background: 'transparent'}}
              >
                <Navbar.Content enableCursorHighlight variant='highlight-rounded'>
                    <Navbar.Link isActive>Deposit</Navbar.Link>
                </Navbar.Content>
              </Navbar>
              <Text b size={'m'}>Inputs</Text>
              {
                underlierBalance &&
                <Text size={"$sm"}>
                  Balance: ${convertToHumanReadableValue(underlierBalance, underlierScale)}
              </Text>
              }
              <Grid.Container gap={0} justify='space-between' css={{ marginBottom: '1rem' }}>
                <Grid>
                  <Input
                    disabled={disableActions}
                    value={floor2(scaleToDec(underlier, underlierScale))}
                    onChange={(event) => {
                      if (event.target.value === null || event.target.value === undefined || event.target.value === '') {
                        props.onUpdateUnderlier(null);
                      } else {
                        props.onUpdateUnderlier(decToScale(floor4((Number(event.target.value) < 0)
                          ? 0
                          : Number(event.target.value)), underlierScale)
                        );
                      }
                    }}
                    placeholder='0'
                    type='number'
                    label='Underlier to swap'
                    labelRight={underlierSymbol}
                    bordered
                    size='sm'
                    borderWeight='light'
                  />
                </Grid>
                <Grid>
                  <Input
                    disabled={disableActions}
                    value={floor2(Number(wadToDec(slippagePct)) * 100)}
                    onChange={(event) => {
                      if (event.target.value === null || event.target.value === undefined || event.target.value === '') {
                        props.onUpdateSlippage(null);
                      } else {
                        const ceiled = (Number(event.target.value) < 0)
                          ? 0 : (Number(event.target.value) > 50) ? 50
                          : Number(event.target.value);
                        props.onUpdateSlippage(decToWad(floor4(ceiled / 100)));
                      }
                    }}
                    step='0.01'
                    placeholder='0'
                    type='number'
                    label='Slippage'
                    labelRight={'%'}
                    bordered
                    size='sm'
                    borderWeight='light'
                    width='7.5rem'
                  />
                </Grid>
              </Grid.Container>
              <Text size={'0.75rem'} style={{ paddingLeft: '0.25rem', marginBottom: '0.375rem' }}>
                Targeted health factor ({Number(wadToDec(targetedHealthFactor))})
              </Text>
              <Card variant='bordered' borderWeight='light'>
                <Card.Body style={{ paddingLeft: '2.25rem', paddingRight: '2.25rem' }}>
                  <Slider
                    handleStyle={{ borderColor: '#0072F5' }}
                    included={false}
                    disabled={disableActions}
                    value={Number(wadToDec(targetedHealthFactor))}
                    onChange={(value) => props.onUpdateTargetedHealthFactor(decToWad(String(value)))}
                    min={1.001}
                    max={5.0}
                    step={0.001}
                    reverse
                    tooltip={{ getPopupContainer: (t) => t }}
                    marks={{
                      5.00: { style: { color: 'grey', fontSize: '0.75rem' }, label: 'Safe' },
                      4.0: { style: { color: 'grey', fontSize: '0.75rem' }, label: '4.0' },
                      3.00: { style: { color: 'grey', fontSize: '0.75rem' }, label: '3.0' },
                      2.00: { style: { color: 'grey', fontSize: '0.75rem' }, label: '2.0' },
                      1.001: { style: { color: 'grey', fontSize: '0.75rem', borderColor: 'white' }, label: 'Unsafe' },
                    }}
                  />
                </Card.Body>
              </Card>
            </Modal.Body>
            <Spacer y={0.75} />
            <Card.Divider/>
            <Modal.Body>
              <Spacer y={0} />
              <Text b size={'m'}>Swap Preview</Text>
              <Input
                readOnly
                value={(outdated) ? (' ') : (floor4(wadToDec(deltaCollateral)))}
                placeholder='0'
                type='string'
                label={'Collateral to deposit (incl. slippage)'}
                labelRight={tokenSymbol}
                contentLeft={(outdated) ? (<Loading size='xs'/>) : (null)}
                size='sm'
                status='primary'
              />
            </Modal.Body>
            <Spacer y={0.75} />
            <Card.Divider/>
            <Modal.Body>
              <Spacer y={0} />
              <Text b size={'m'}>Position Preview</Text>
              <Input
                readOnly
                value={(outdated) ? (' ') : (floor4(wadToDec(collateral)))}
                placeholder='0'
                type='string'
                label={'Collateral'}
                labelRight={tokenSymbol}
                contentLeft={(outdated) ? (<Loading size='xs'/>) : (null)}
                size='sm'
                status='primary'
              />
              <Input
                readOnly
                value={(outdated) ? (' ') : (floor4(wadToDec(debt)))}
                placeholder='0'
                type='string'
                label='Debt'
                labelRight={'FIAT'}
                contentLeft={(outdated) ? (<Loading size='xs'/>) : (null)}
                size='sm'
                status='primary'
              />
              <Input
                readOnly
                value={(outdated) ? (' ') : (healthFactor.eq(ethers.constants.MaxUint256)) ? ('∞') : (floor4(wadToDec(healthFactor)))}
                placeholder='0'
                type='string'
                label='Health Factor'
                labelRight={'🚦'}
                contentLeft={(outdated) ? (<Loading size='xs'/>) : (null)}
                size='sm'
                status='primary'
              />
              {/* <Spacer y={0} />
              <Text b size={'m'}>Summary</Text>
              <Text size="0.75rem">{(modifyPositionFormData.deltaCollateral.isZero()) ? null : 
          <Text size="0.75rem">{(modifyPositionFormData.deltaCollateral.isZero()) ? null : 
              <Text size="0.75rem">{(modifyPositionFormData.deltaCollateral.isZero()) ? null : 
              <>
                Swap <b>{floor2(scaleToDec(modifyPositionFormData.underlier, modifyPositionData.collateralType.properties.underlierScale))} {modifyPositionData.collateralType.properties.underlierSymbol} </b>
                for <b>~{floor2(wadToDec(modifyPositionFormData.deltaCollateral))} {modifyPositionData.collateralType.metadata.symbol}</b>.
                Deposit <b>~{floor2(wadToDec(modifyPositionFormData.deltaCollateral))} {modifyPositionData.collateralType.metadata.symbol}</b> as deltaCollateral.
                Borrow <b>~{floor2(wadToDec(modifyPositionFormData.deltaDebt))} FIAT</b> against the deltaCollateral.
              </>
              }</Text> */}
            </Modal.Body>
            <Modal.Footer justify='space-evenly'>
              <Text size={'0.875rem'}>
                Approve {underlierSymbol}
              </Text>
              <Switch
                disabled={disableActions || !hasProxy}
                // @ts-ignore
                checked={() => (!underlier.isZero() && underlierAllowance?.gte(underlier))}
                onChange={() => (!underlier.isZero() && underlierAllowance?.gte(underlier))
                  ? props.onSendTransaction('unsetUnderlierAllowance')
                  : props.onSendTransaction('setUnderlierAllowance')
                }
                color='primary'
                icon={
                  (['setUnderlierAllowance', 'unsetUnderlierAllowance'].includes(currentTxAction || '') && disableActions)
                    ? (<Loading size='xs' />)
                    : (null)
                }
              />
              <Spacer y={0.5} />
              <Text size={'0.875rem'}>Enable FIAT</Text>
              <Switch
                disabled={disableActions || !hasProxy}
                // @ts-ignore
                checked={() => (!!monetaDelegate)}
                onChange={() => (!!monetaDelegate)
                  ? props.onSendTransaction('unsetMonetaDelegate')
                  : props.onSendTransaction('setMonetaDelegate')
                }
                color='primary'
                icon={
                  (['setMonetaDelegate', 'unsetMonetaDelegate'].includes(currentTxAction || '') && disableActions)
                    ? (<Loading size='xs' />)
                    : (null)
                }
              />
              <Spacer y={3} />
              <Button
                css={{minWidth: '100%'}}
                disabled={(
                  disableActions
                  || !hasProxy
                  || underlier?.isZero()
                  || deltaCollateral?.isZero()
                  || underlierAllowance?.lt(underlier)
                  || monetaDelegate === false
                )}
                icon={(disableActions && currentTxAction === 'buyCollateralAndModifyDebt') ? (<Loading size='xs' />) : (null)}
                onPress={() => props.onSendTransaction('buyCollateralAndModifyDebt')}
              >
                Deposit
              </Button>
            </Modal.Footer>
          </>
        );
      })()
      )}
    </Modal>
  );
};