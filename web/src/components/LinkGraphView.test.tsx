import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { LinkGraph } from '../api/types'
import { LinkGraphView } from './LinkGraphView'

const graph: LinkGraph = {
  seedId: 'case:SW-1',
  seedLabel: 'SW-1',
  nodeBudget: 60,
  truncated: false,
  nodes: [
    {
      id: 'case:SW-1',
      type: 'CASE',
      label: 'SW-1',
      sublabel: 'Vandalism — Dallas Yard',
      hops: 0,
      weight: 3,
      detail: [{ label: 'Status', value: 'IN_PROGRESS' }],
    },
    {
      id: 'site:SITE-A',
      type: 'SITE',
      label: 'Dallas Yard',
      sublabel: 'SITE-A',
      hops: 1,
      weight: 2.5,
      detail: [{ label: 'Region', value: 'SOUTHWEST' }],
    },
    {
      id: 'incident:1',
      type: 'INCIDENT',
      label: 'VANDALISM',
      sublabel: '2026-07-02',
      hops: 2,
      weight: 1,
      detail: [{ label: 'Severity', value: 'HIGH' }],
    },
    {
      id: 'badge:abcdef1234',
      type: 'BADGE',
      label: 'abcdef12',
      sublabel: '4 after-hours reads',
      hops: 2,
      weight: 1.5,
      detail: [{ label: 'After-hours reads', value: '4' }],
    },
    {
      id: 'site:SITE-B',
      type: 'SITE',
      label: 'Phoenix Depot',
      sublabel: 'SITE-B',
      hops: 3,
      weight: 2.5,
      detail: [{ label: 'Region', value: 'SOUTHWEST' }],
    },
  ],
  edges: [
    { source: 'case:SW-1', target: 'site:SITE-A', type: 'AT_SITE', label: 'case site', weight: 1 },
    { source: 'incident:1', target: 'site:SITE-A', type: 'AT_SITE', label: 'occurred at', weight: 1 },
    { source: 'badge:abcdef1234', target: 'site:SITE-A', type: 'ACCESSED', label: '4 after-hours', weight: 4 },
    { source: 'badge:abcdef1234', target: 'site:SITE-B', type: 'ACCESSED', label: '3 after-hours', weight: 3 },
  ],
}

describe('link graph', () => {
  it('renders one mark per record and one line per connection', () => {
    const { container } = render(<LinkGraphView graph={graph} />)

    const canvas = screen.getByRole('img', { name: /Link graph around case SW-1/i })
    expect(canvas).toBeInTheDocument()
    expect(within(canvas as HTMLElement).queryAllByText(/Dallas Yard|abcdef12|Phoenix Depot/)).not.toHaveLength(0)
    expect(container.querySelectorAll('svg line')).toHaveLength(graph.edges.length)
  })

  it('lays out identically on every render', () => {
    // A force simulation would settle somewhere slightly different each time, which is
    // wrong for a screen an investigator returns to and for a screenshot in a case file.
    const first = render(<LinkGraphView graph={graph} />).container.innerHTML
    const second = render(<LinkGraphView graph={graph} />).container.innerHTML
    expect(first).toEqual(second)
  })

  it('offers a table view of the same records', () => {
    render(<LinkGraphView graph={graph} />)

    expect(screen.getByText('View as a table')).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByText('Phoenix Depot')).toBeInTheDocument()
    expect(within(table).getByText('Badge (after hours)')).toBeInTheDocument()
  })

  it('says when the graph was truncated rather than implying it is complete', () => {
    const { rerender } = render(<LinkGraphView graph={graph} />)
    expect(screen.queryByText(/strongest/)).not.toBeInTheDocument()

    rerender(<LinkGraphView graph={{ ...graph, truncated: true }} />)
    expect(screen.getByText(/showing the strongest 60 connections/)).toBeInTheDocument()
  })

  it('states that badge identifiers are pseudonymised', () => {
    render(<LinkGraphView graph={graph} />)
    expect(screen.getByText(/pseudonymised/)).toBeInTheDocument()
  })

  it('handles a case with nothing connected to it', () => {
    render(
      <LinkGraphView graph={{ ...graph, nodes: [graph.nodes[0]], edges: [] }} />,
    )
    expect(screen.getByText(/Nothing else in the last year connects/)).toBeInTheDocument()
  })
})
