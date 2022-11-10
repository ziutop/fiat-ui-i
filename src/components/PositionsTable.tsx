import React from 'react';
import { SortDescriptor, Col, Row, styled, Table, Text, User } from '@nextui-org/react';

import { WAD, wadToDec } from '@fiatdao/sdk';

import { encodePositionId, getCollateralTypeData } from '../utils';
import Skeleton from 'react-loading-skeleton';
import { formatUnixTimestamp } from '../utils';

const StyledBadge = styled('span', {
  display: 'inline-block',
  textTransform: 'uppercase',
  padding: '$2 $3',
  margin: '0 2px',
  fontSize: '10px',
  fontWeight: '$bold',
  borderRadius: '14px',
  letterSpacing: '0.6px',
  lineHeight: 1,
  boxShadow: '1px 2px 5px 0px rgb(0 0 0 / 5%)',
  alignItems: 'center',
  alignSelf: 'center',
  color: '$white',
  variants: {
    type: {
      green: {
        bg: '$successLight',
        color: '$successLightContrast',
      },
      red: {
        bg: '$errorLight',
        color: '$errorLightContrast',
      },
      orange: {
        bg: '$warningLight',
        color: '$warningLightContrast',
      },
    },
  },
  defaultVariants: {
    type: 'active',
  },
});

interface PositionsTableProps {
  collateralTypesData: Array<any>;
  positionsData: Array<any>;
  onSelectPosition: (positionId: string) => void;
}

export const PositionsTable = (props: PositionsTableProps) => {
  const [sortProps, setSortProps] = React.useState<SortDescriptor>({
    column: 'Maturity',
    direction: 'descending'
  });
  const colNames = React.useMemo(() => {
    return ['Asset', 'Underlier', 'Collateral', 'Normal Debt', 'Maturity'];
  }, []);

  const cells = React.useMemo(() => {
    props.positionsData.sort((a: any, b: any) : number => {
      if (!props.collateralTypesData || !a || !b) return 0;
      const { vault: vaultA, tokenId: tokenIdA } = a;
      const { vault: vaultB, tokenId: tokenIdB } = b;
      const { properties: { maturity: maturityA }} = getCollateralTypeData(props.collateralTypesData, vaultA, tokenIdA);
      const { properties: { maturity: maturityB }} = getCollateralTypeData(props.collateralTypesData, vaultB, tokenIdB);
      if (sortProps.direction === 'descending' ) {
        return maturityA.toNumber() < maturityB.toNumber() ? 1 : -1
      }
      return maturityA.toNumber() > maturityB.toNumber() ? 1 : -1
    });

    return props.collateralTypesData.length === 0 ? (
      <Table.Row>
        {colNames.map((colName) => (
          <Table.Cell key={colName}>
            <Skeleton count={colNames.length} />
          </Table.Cell>
        ))}
      </Table.Row>
    ) : (
      props.positionsData.map((position) => {
        const { owner, vault, tokenId, collateral, normalDebt } = position;
        const {
          properties: { underlierSymbol, maturity },
          metadata: { protocol, asset, icons, urls },
          state
        } = getCollateralTypeData(props.collateralTypesData, vault, tokenId);
        const maturityFormatted = new Date(Number(maturity.toString()) * 1000);
        return (
          <Table.Row key={encodePositionId(vault, tokenId, owner)}>
            <Table.Cell>
              <User src={icons.asset} name={asset}>
                <User.Link href={urls.asset}>{protocol}</User.Link>
              </User>
            </Table.Cell>
            <Table.Cell>
              <User name={underlierSymbol} src={icons.underlier} size='sm'/>
            </Table.Cell>
            <Table.Cell>
              <Col>
                <Row>
                  {wadToDec(collateral)}
                </Row>
                <Row>
                  {`$${parseFloat(wadToDec(state.collybus.fairPrice.mul(collateral).div(WAD))).toFixed(2)}`}
                </Row>
              </Col>
            </Table.Cell>
            <Table.Cell>{wadToDec(normalDebt)}</Table.Cell>
            <Table.Cell>
              <StyledBadge
                type={new Date() < maturityFormatted ? 'green' : 'red'}
              >
                {formatUnixTimestamp(maturity)}
              </StyledBadge>
            </Table.Cell>
          </Table.Row>
        );
      })
    );
  }, [props.collateralTypesData, props.positionsData, colNames, sortProps]);

  return (
    <>
      <Text h1>Positions</Text>
      <Table
        aria-label='Positions'
        css={{ height: 'auto', minWidth: '100%' }}
        selectionMode='single'
        selectedKeys={'1'}
        onSelectionChange={(selected) =>
          props.onSelectPosition(Object.values(selected)[0])
        }
        sortDescriptor={sortProps as SortDescriptor}
        onSortChange={(data) => {
          setSortProps({
            direction: data.direction,
            column: data.column
          })
        }}
      >
        <Table.Header>
          {colNames.map((colName) => (
            <Table.Column key={colName} allowsSorting={colName === 'Maturity' ? true : false}>{colName}</Table.Column>
          ))}
        </Table.Header>
        <Table.Body>{cells}</Table.Body>
      </Table>
    </>
  );
};
