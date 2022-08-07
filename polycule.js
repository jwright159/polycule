"use strict";

const parameters = new URLSearchParams(window.location.search);
const graphWidth = 1920, graphHeight = 1080, graphScale = 1;

(async () => {
	//---- Data
	let data = await d3.json('polycule.json');

	let node_data = [];
	let link_data = [];

	data.nodes.forEach(node => {
		node_data.push({
			id: node.name,
			name: node.name,
			color: node.color || '#fff'
		});
	});

	data.links.forEach(link => {
		link_data.push({
			source: link.a,
			target: link.b,
			type: link.type || 'romantic'
		});
	})


	//---- Graph
	let svg = d3.select('#graph').append('svg')
		.classed('svg', true)
		.attr('viewBox', [0, 0, graphWidth * graphScale, graphHeight * graphScale])
		.attr('width', graphWidth)
		.attr('height', graphHeight);
	
	let links = svg.selectAll('.link')
		.data(link_data)
		.join('line')
		.classed('link', true);
	
	let nodes = svg.selectAll('.node')
		.data(node_data)
		.join('g')
		.classed('node', true);
	
	nodes.append('circle')
		.attr('r', 10)
		.style('fill', node => node.color)
		.append('title')
			.text(node => node.name);
	
	nodes.append('text')
		.text(node => node.name)
		.attr('dx', 0)
		.attr('dy', -12)
		.attr('text-anchor', 'middle');
	
	
	//---- Simulation
	let simulation = d3.forceSimulation(node_data)
		.force('charge', d3.forceManyBody().strength(-50))
		.force('center', d3.forceCenter(graphWidth * graphScale / 2, graphHeight * graphScale / 2))
		.force('link', d3.forceLink(link_data).id(node => node.id).distance(20))
		.on('tick', () => {
			links
				.attr('x1', link => link.source.x)
				.attr('y1', link => link.source.y)
				.attr('x2', link => link.target.x)
				.attr('y2', link => link.target.y);

			nodes
				.attr('transform', node => `translate(${node.x}, ${node.y})`)
				.select('circle')
					.style('stroke', node => node.pinned ? '#000' : null);
		});
	
	nodes
		.call(d3.drag()
			.on('start', (event, node) => {
				if (!event.active) simulation.alphaTarget(0.3).restart();
				node.fx = node.x;
				node.fy = node.y;
			})
			.on('drag', (event, node) => {
				node.fx = event.x;
				node.fy = event.y;
			})
			.on('end', (event, node) => {
				if (!event.active) simulation.alphaTarget(0);
				if (!node.pinned)
				{
					node.fx = null;
					node.fy = null;
				}
			}))
		.on('click', (_event, node) => {
			simulation.restart();
			node.pinned = !node.pinned;
			if (node.pinned)
			{
				node.fx = node.x;
				node.fy = node.y;
			}
			else
			{
				node.fx = null;
				node.fy = null;
			}
		});
	
	
	//---- Final attribute/data calls, after links are made
	nodes
		.each(node => node.weight = links.filter(link => link.source === node || link.target === node).size());

	simulation.force('link')
		.strength(link => 0.2 / Math.min(link.source.weight, link.target.weight))
		.distance(50);
})();