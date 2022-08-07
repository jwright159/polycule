"use strict";

const parameters = new URLSearchParams(window.location.search);
const graphWidth = 1920, graphHeight = 1080, graphScale = 1;

function angleBetween(pointA, pointB)
{
	let x = pointB[0] - pointA[0];
	let y = pointB[1] - pointA[1];
	return Math.atan(y / x) + (Math.sign(x) > 0 ? Math.PI : 0);
}

(async () => {
	//---- Data
	let data = await d3.json('polycule.json');

	let node_data = [];
	let group_data = [];
	let link_data = [];

	data.nodes.forEach(node => {
		node_data.push({
			id: node.name,
			name: node.name,
			color: node.color || '#fff',
		});
	});

	data.groups.forEach(group => {
		group_data.push({
			members: group.members.map(member_id => node_data.filter(node => node.id === member_id)[0]),
			color: group.color || '#fff8',
			radius: group.radius || 20,
		});
	});

	data.links.forEach(link => {
		link_data.push({
			source: link.a,
			target: link.b,
			type: link.type || 'romantic',
		});
	})


	//---- Graph
	let svg = d3.select('#graph').append('svg')
		.classed('svg', true)
		.attr('viewBox', [0, 0, graphWidth * graphScale, graphHeight * graphScale])
		.attr('width', graphWidth)
		.attr('height', graphHeight);
	
	let groups = svg.selectAll('.group')
		.data(group_data)
		.join('path')
		.classed('group', true)
		.style('fill', group => group.color);

	let links = svg.selectAll('.link')
		.data(link_data)
		.join('line')
		.classed('link', true)
		.each(function(link){ d3.select(this).classed(link.type, true); });
	
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

			nodes
				.attr('transform', node => `translate(${node.x}, ${node.y})`)
				.select('circle')
					.classed('pinned', node => node.pinned);
			
			groups
				.attr('d', group => {
					let mappedPoints = group.members.map(node => [node.x, node.y]);
					let points = d3.polygonHull(mappedPoints) || mappedPoints;
					let path = d3.path();
					for (let i = 0; i < points.length; i++)
					{
						let prevPoint = points[i - 1 < 0 ? points.length - 1 : i - 1];
						let point = points[i];
						let nextPoint = points[i + 1 === points.length ? 0 : i + 1]
						
						let startAngle = angleBetween(prevPoint, point) - Math.PI / 2;
						let endAngle = angleBetween(point, nextPoint) - Math.PI / 2;

						if (i === 0)
							path.moveTo(point[0] + Math.cos(startAngle) * group.radius, point[1] + Math.sin(startAngle) * group.radius);
						
						path.arc(point[0], point[1], group.radius, startAngle, endAngle, true);
					}
					path.closePath();
					return path;
				});
			
			links
				.attr('x1', link => link.source.x)
				.attr('y1', link => link.source.y)
				.attr('x2', link => link.target.x)
				.attr('y2', link => link.target.y);
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