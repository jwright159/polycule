"use strict";

const parameters = new URLSearchParams(window.location.search);
const graphWidth = 1600, graphHeight = 900, graphScale = 1;

function angleBetween(pointA, pointB)
{
	let x = pointB[0] - pointA[0];
	let y = pointB[1] - pointA[1];
	return Math.atan(y / x) + (Math.sign(x) > 0 ? Math.PI : 0);
}

function namespace(parent, node)
{
	return (parent ? parent.id + ':' : '') + node;
}

async function doSimulation(filename)
{
	//---- Data
	let data = await d3.json(filename);

	let nodeData = [];
	let groupData = [];
	let linkData = [];

	function parseNode(node, parentGroup)
	{
		let newNode = {
			id: namespace(parentGroup, node.id || node.name),
			name: node.name,
			color: node.color,
			proxy: node.proxy || false,
			type: node.type,
			tag: node.tag,
		};
		nodeData.push(newNode);
		return newNode;
	}

	function parseGroup(group, parentGroup)
	{
		let newGroup = {
			id: namespace(parentGroup, group.name || group.proxy),
			name: group.name || (group.proxy && group.type === 'subsystem' ? group.proxy : undefined),
			type: group.type || 'generic',
			color: group.color,
			bgcolor: group.bgcolor || group.color,
			radius: group.radius || 20,
			createdMembers: [],
			members: [],
		};
		groupData.push(newGroup);

		if ('nodes' in group)
		{
			group.nodes.forEach(member =>{
				if (typeof member === 'string')
				{
					let newNode = nodeData.filter(node => node.id === namespace(parentGroup, member))[0];
					if (newNode)
						newGroup.members.push(newNode);
					else
						throw new Error(`Couldn't find the node ${member} to link to from the group ${newGroup.id}`);
				}
				else
				{
					let newNode = parseNode(member, newGroup);
					newGroup.createdMembers.push(newNode);
					newGroup.members.push(newNode);
				}
			});
		}

		if ('proxy' in group)
		{
			let proxy = parseNode({
				id: group.proxy,
				color: group.color || (parentGroup ? parentGroup.color : undefined),
				proxy: true,
				type: group.type,
				tag: group.tag,
			}, parentGroup);

			newGroup.members.forEach(member => parseLink({
				a: member.id,
				b: proxy.id,
				type: 'proxy',
			}));

			if (group.type === 'subsystem')
				newGroup.createdMembers.push(proxy);
			newGroup.members.push(proxy);
			newGroup.proxy = proxy;
		}

		if ('groups' in group)
			group.groups.forEach(subgroup => newGroup.members.push(...parseGroup(subgroup, newGroup).createdMembers));
		
		if ('links' in group)
			group.links.forEach(link => parseLink(link, newGroup));

		return newGroup;
	}

	function parseLink(link, parentGroup)
	{
		let newLink = {
			source: namespace(parentGroup, link.a),
			target: namespace(parentGroup, link.b),
			type: link.type || 'redrom',
		};
		linkData.push(newLink);
		return newLink;
	}

	data.nodes.forEach(node => parseNode(node));
	data.groups.forEach(group => parseGroup(group));
	data.links.forEach(link => parseLink(link))


	//---- Graph
	let svg = d3.select('#graph').append('svg')
		.classed('svg', true)
		.attr('viewBox', [0, 0, graphWidth * graphScale, graphHeight * graphScale])
		.attr('width', graphWidth)
		.attr('height', graphHeight);
	
	const markerBoxSize = 6;
	svg.append('defs')
		.append('marker')
			.attr('id', 'arrow')
			.attr('viewBox', [0, 0, markerBoxSize, markerBoxSize])
			.attr('refX', markerBoxSize / 2 + 5)
			.attr('refY', markerBoxSize / 2)
			.attr('markerWidth', markerBoxSize)
			.attr('markerHeight', markerBoxSize)
			.attr('orient', 'auto-start-reverse')
		.append('path')
			.attr('d', `M ${markerBoxSize / 2} ${markerBoxSize / 2} 0 ${markerBoxSize / 4} 0 ${markerBoxSize * 3 / 4} ${markerBoxSize / 2} ${markerBoxSize / 2}`)
			.style('stroke', 'context-stroke')
			.style('fill', 'context-stroke')

	let groups = svg.selectAll('.group')
		.data(groupData)
		.join('g')
		.classed('group', true)
		.each(function(group){ d3.select(this).classed(group.type, true); });
	
	groups.append('path')
		.style('fill', group => group.bgcolor);
	
	groups.append('text')
		.text(group => group.name)
		.attr('text-anchor', 'middle');

	let links = svg.selectAll('.link')
		.data(linkData)
		.join('line')
		.classed('link', true)
		.each(function(link){ d3.select(this).classed(link.type, true); });
	
	let nodes = svg.selectAll('.node')
		.data(nodeData)
		.join('g')
		.classed('node', true)
		.classed('proxy', node => node.proxy)
		.each(function(node){ d3.select(this).classed(node.type, node.proxy); });
	
	nodes.append('circle')
		.attr('r', 10)
		.style('fill', node => node.color)
		.append('title')
			.text(node => node.id);
	
	nodes.append('text')
		.text(node => node.name)
		.attr('dx', 0)
		.attr('dy', -12)
		.attr('text-anchor', 'middle');
	
	nodes.append('text')
		.text(node => node.tag)
		.attr('dx', 0)
		.attr('dy', 3)
		.attr('text-anchor', 'middle');
	
	//---- Simulation
	let simulation = d3.forceSimulation(nodeData)
		.force('charge', d3.forceManyBody().strength(-300).distanceMax(200))
		.force('center', d3.forceCenter(graphWidth * graphScale / 2, graphHeight * graphScale / 2))
		.force('centerR', d3.forceRadial(0, graphWidth * graphScale / 2, graphHeight * graphScale / 2).strength(0.01))
		.force('link', d3.forceLink(linkData).id(node => node.id))
		.on('tick', () => {

			nodes
				.attr('transform', node => `translate(${node.x}, ${node.y})`)
				.select('circle')
					.classed('pinned', node => node.pinned);
			
			groups
				.each(function(group){
					let element = d3.select(this);

					let mappedPoints = group.members.map(node => [node.x, node.y]);
					let points = d3.polygonHull(mappedPoints) || mappedPoints;
					if (points.length === 0)
						return;

					let path = d3.path();
					if (points.length > 1)
					{
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
					}
					else
					{
						let point = points[0];
						path.moveTo(point[0] + group.radius, point[1]);
						path.arc(point[0], point[1], group.radius, 0, Math.PI * 2, true);
					}
					path.closePath();
					element.select('path')
						.attr('d', path);

					let averageX = mappedPoints.reduce((previous, current) => previous + current[0], 0) / mappedPoints.length;
					let averageY = mappedPoints.reduce((previous, current) => previous + current[1], 0) / mappedPoints.length;
					let highestY = mappedPoints.reduce((previous, current) => Math.min(previous, current[1]), points[0][1]);
					element.select('text')
						.attr('x', averageX)
						.attr('y', highestY - group.radius - 5);
					
					let force = simulation.force('center-' + group.name);
					if (force)
						force.x(averageX).y(averageY);
				});
			
			links
				.attr('x1', link => link.source.x)
				.attr('y1', link => link.source.y)
				.attr('x2', link => link.target.x)
				.attr('y2', link => link.target.y);
		});
	
	groups.each(group => group.proxy ? undefined : simulation.force('center-' + group.name, d3.forceRadial(0).strength(node => group.members.includes(node) ? 0.13 : 0)));
	
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
	links.attr('marker-end', link => link.type == 'parent' ? 'url(#arrow)' : null)
	
	nodes.each(node => node.weight = links.filter(link => link.source === node || link.target === node).size());

	simulation.force('link').strength(link => 2 / Math.min(link.source.weight, link.target.weight)).distance(link => link.type === 'proxy' ? 30 : 80);
}