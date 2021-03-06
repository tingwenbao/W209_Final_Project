HTMLWidgets.widget({

    name: 'sankeytree',

    type: 'output',

    initialize: function (el, width, height) {

        d3.select(el)
            .append("div")
            .classed("svg-container", true)
            .append("svg")
            .attr("preserveAspectRatio", "xMinYMin meet")
            .attr("viewBox", "0 0 " + width + " " + height)
            .classed("svg-content-responsive", true)
            .attr("width", "100%")
            .attr("height", "100%");

        var instance = {};

        return instance;

    },

    renderValue: function (el, x, instance) {
        // ATTRIBUTION:  much of this JavaScript code
        //  came from http://bl.ocks.org/robschmuecker/0f29a2c867dcb1b44d18

        var dispatch = d3.dispatch("update", "click", "mouseover", "mouseout");
        d3.rebind(instance, dispatch, 'on');

        var opts = x.opts;
        var treeData = x.data;

        // Calculate total nodes, max label length
        var totalNodes = 0;
        var maxLabelLength = 0;
        // variables for drag/drop
        var selectedNode = null;
        var draggingNode = null;
        // panning variables
        var panSpeed = 200;
        var panBoundary = 20; // Within 20px from edges will pan when dragging.
        // Misc. variables
        var i = 0;
        var duration = 750;
        var root;
        var pxPerChar = 6;
        var newWidth;
        var newHeight;

        // add treeColors if told yes
        if (x.opts.treeColors) {
            var tc = TreeColors("add");
            tc.children(opts.childrenName);
            tc(treeData);
        }

        // work on tooltip
        var tip = {};

        if (opts.tooltip) {
            tip = d3.tip()
                .attr('class', 'd3-tip')
                .html(function (d) {
                    return d;
                });

            if (Array.isArray(opts.tooltip)) {
                tip.html(function (d) {
                    var htmltip = [];
                    opts.tooltip.forEach(function (ky) {
                        htmltip.push(ky + ": " + d[ky]);
                    });
                    return htmltip.join("<br/>");
                });
            } else if (typeof (opts.tooltip) === "function") {
                tip.html(opts.tooltip);
            }
        }

        // define the baseSvg, attaching a class for styling and the zoomListener
        var baseSvg = d3.select(el)
            .select("div")
            .select("svg");

        // Append a group which holds all nodes and which the zoom Listener can act upon.
        var svgGroup = baseSvg.append("g");



        // size of the diagram
        var viewerWidth = el.getBoundingClientRect().width;
        var viewerHeight = el.getBoundingClientRect().height;

        var tree = d3.layout.tree()
            .size([viewerHeight, viewerWidth])
            .children(function (d) {
                return d[opts.childrenName]
            })
            .value(function (d) {
                return d[opts.value]
            });

        // define a d3 diagonal projection for use by the node paths later on.
        var diagonal = d3.svg.diagonal()
            .projection(function (d) {
                return [d.y, d.x];
            })
            .source(function (d) {
                if (d.ystacky) return d
                return d.source;
            });

        // A recursive helper function for performing some setup by walking through all nodes

        function visit(parent, visitFn, childrenFn) {
            if (!parent) return;

            visitFn(parent);

            var children = childrenFn(parent);
            if (children) {
                var count = children.length;
                for (var i = 0; i < count; i++) {
                    visit(children[i], visitFn, childrenFn);
                }
            }
        }

        // Call visit function to establish maxLabelLength
        var meanLabelLength = 0.0;
        visit(treeData, function (d) {
            totalNodes++;
            maxLabelLength = opts.maxLabelLength || Math.max(d[opts.name].length, maxLabelLength);
            meanLabelLength = meanLabelLength + d[opts.name].length;

        }, function (d) {
            return d[opts.childrenName] && d[opts.childrenName].length > 0 ? d[opts.childrenName] : null;
        });
        meanLabelLength = (meanLabelLength / totalNodes) | 0 + 1;

        // sort the tree according to the node names

        function sortTree() {
            tree.sort(function (a, b) {
                return b[opts.name].toLowerCase() < a[opts.name].toLowerCase() ? 1 : -1;
            });
        }
        // Sort the tree initially in case the JSON isn't in a sorted order.
        sortTree();


        // TODO: Pan function, can be better implemented.

        function pan(domNode, direction) {
            var speed = panSpeed;
            if (panTimer) {
                clearTimeout(panTimer);
                translateCoords = d3.transform(svgGroup.attr("transform"));
                if (direction == 'left' || direction == 'right') {
                    translateX = direction == 'left' ? translateCoords.translate[0] + speed : translateCoords.translate[0] - speed;
                    translateY = translateCoords.translate[1];
                } else if (direction == 'up' || direction == 'down') {
                    translateX = translateCoords.translate[0];
                    translateY = direction == 'up' ? translateCoords.translate[1] + speed : translateCoords.translate[1] - speed;
                }
                scaleX = translateCoords.scale[0];
                scaleY = translateCoords.scale[1];
                scale = zoomListener.scale();
                svgGroup.transition().attr("transform", "translate(" + translateX + "," + translateY + ")scale(" + scale + ")");
                d3.select(domNode).select('g.node').attr("transform", "translate(" + translateX + "," + translateY + ")");
                zoomListener.scale(zoomListener.scale());
                zoomListener.translate([translateX, translateY]);
                panTimer = setTimeout(function () {
                    pan(domNode, speed, direction);
                }, 50);
            }
        }

        ///////////////////////////////////////////
        //               Zoom                    //
        ///////////////////////////////////////////
        // Define the zoom function for the zoomable tree
        var zoom = d3.select(".zoom").append("svg")
        //.attr("width", 40)
        //.attr("height", 40);


        // create zoom buttons
        zoomButtons = baseSvg.append('g').attr('class', 'zoom-button');
        zoomOut = zoomButtons.append('g');
        zoomIn = zoomButtons.append('g');

        zoomIn
            .append('text')
            .attr('x', 17)
            .attr('y', 31)
            .text('+')
            .attr('class', 'zoom-button-text');
        zoomIn
            .append('rect')
            .attr('x', 10)
            .attr('y', 10)
            .attr('width', '30')
            .attr('height', '30')
            .attr('id', 'zoom_in');

        zoomOut
            .append('text')
            .attr('x', 22)
            .attr('y', 66)
            .text('-')
            .attr('class', 'zoom-button-text');


        zoomOut
            .append('rect')
            .attr('x', 10)
            .attr('y', 45)
            .attr('width', '30')
            .attr('height', '30')
            .attr('id', 'zoom_out');


        // Zoom behavior

        var zoomfactor = 1;


        zoomIn.on("click", function () {
            console.log(this.x);
            zoomfactor = zoomfactor + 0.2;
            zoomListener.scale(zoomfactor).event(d3.select(baseSvg));
        });

        d3.select("#zoom_out").on("click", function () {
            zoomfactor = zoomfactor - 0.2;
            zoomListener.scale(zoomfactor).event(d3.select(baseSvg));
        });

        function redraw() {
            svgGroup.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
        }


        // define the zoomListener which calls the zoom function on the "zoom" event constrained within the scaleExtents
        var zoomListener = d3.behavior.zoom().scaleExtent([0.1, 3]).on("zoom", redraw);




        ////////////////////////////////////
        //              toggle            //
        ////////////////////////////////////

        function initiateDrag(d, domNode) {
            draggingNode = d;
            d3.select(domNode).select('.ghostCircle').attr('pointer-events', 'none');
            d3.selectAll('.ghostCircle').attr('class', 'ghostCircle show');
            d3.select(domNode).attr('class', 'node activeDrag');
            svgGroup.selectAll("g.node").sort(function (a, b) { // select the parent and sort the path's
                if (a[opts.id] != draggingNode[opts.id]) return 1; // a is not the hovered element, send "a" to the back
                else return -1; // a is the hovered element, bring "a" to the front
            });
            // if nodes has children, remove the links and nodes
            if (nodes.length > 1) {
                // remove link paths
                links = tree.links(nodes);
                nodePaths = svgGroup.selectAll("path.link")
                    .data(links, function (d) {
                        return d.target[opts.id];
                    }).remove();
                // remove child nodes
                nodesExit = svgGroup.selectAll("g.node")
                    .data(nodes, function (d) {
                        return d[opts.id];
                    }).filter(function (d, i) {
                        if (d[opts.id] == draggingNode[opts.id]) {
                            return false;
                        }
                        return true;
                    }).remove();
            }

            // remove parent link
            parentLink = tree.links(tree.nodes(draggingNode.parent));
            svgGroup.selectAll('path.link').filter(function (d, i) {
                if (d.target[opts.id] == draggingNode[opts.id]) {
                    return true;
                }
                return false;
            }).remove();

            dragStarted = null;
        }

        baseSvg
            .call(zoomListener);


        // Helper functions for collapsing and expanding nodes.

        function collapse(d) {
            if (d[opts.childrenName]) {
                d._children = d[opts.childrenName];
                d._children.forEach(collapse);
                d[opts.childrenName] = null;
            }
        }

        function expand(d) {
            if (d._children) {
                d[opts.childrenName] = d._children;
                d[opts.childrenName].forEach(expand);
                d._children = null;
            }
        }

        var overCircle = function (d) {
            selectedNode = d;
            updateTempConnector();
        };
        var outCircle = function (d) {
            selectedNode = null;
            updateTempConnector();
        };

        // Function to update the temporary connector indicating dragging affiliation
        var updateTempConnector = function () {
            var data = [];
            if (draggingNode !== null && selectedNode !== null) {
                // have to flip the source coordinates since we did this for the existing connectors on the original tree
                data = [{
                    source: {
                        x: selectedNode.y0,
                        y: selectedNode.x0
                    },
                    target: {
                        x: draggingNode.y0,
                        y: draggingNode.x0
                    }
                }];
            }
            var link = svgGroup.selectAll(".templink").data(data);

            link.enter().append("path")
                .attr("class", "templink")
                .attr("d", d3.svg.diagonal())
                .attr('pointer-events', 'none');

            link.attr("d", d3.svg.diagonal());

            link.exit().remove();
        };

        // Function to center node when clicked/dropped so node doesn't get lost when collapsing/moving with large amount of children.

        function centerNode(source) {
            scale = zoomListener.scale();
            x = -source.y0;
            y = -source.x0;
            x = x * scale + (source[opts.name] !== root[opts.name] ? viewerWidth / 2 : viewerWidth / 4);
            y = y * scale + viewerHeight / 2;
            d3.select('g').transition()
                .duration(duration)
                .attr("transform", "translate(" + x + "," + y + ")scale(" + scale + ")");
            zoomListener.scale(scale);
            zoomListener.translate([x, y]);
        }

        // Toggle children function

        function toggleChildren(d) {
            if (d[opts.childrenName]) {
                d._children = d[opts.childrenName];
                d[opts.childrenName] = null;
            } else if (d._children) {
                d[opts.childrenName] = d._children;
                d._children = null;
            }
            return d;
        }

        // Toggle children on click.

        function click(d) {
            if (d3.event.defaultPrevented) return; // click suppressed
            d = toggleChildren(d);
            update(d);
            centerNode(d);
        }


        function update(source) {
            // Compute the new height, function counts total children of root node and sets tree height accordingly.
            // This prevents the layout looking squashed when new nodes are made visible or looking sparse when nodes are removed
            // This makes the layout more consistent.
            var levelWidth = [1];
            var childCount = function (level, n) {

                if (n[opts.childrenName] && n[opts.childrenName].length > 0) {
                    if (levelWidth.length <= level + 1) levelWidth.push(0);

                    levelWidth[level + 1] += n[opts.childrenName].length;
                    n[opts.childrenName].forEach(function (d) {
                        childCount(level + 1, d);
                    });
                }
            };
            childCount(0, root);
            newHeight = d3.max(levelWidth) * (opts.nodeHeight || 25); // 25 pixels per line

            if (opts.maxLabelLength) {
                newWidth = (levelWidth.length + 2) * (maxLabelLength * 10) +
                    levelWidth.length * 10; // node link size + node rect size
            } else {
                newWidth = (levelWidth.length + 2) * (meanLabelLength * pxPerChar) +
                    levelWidth.length * 10; // node link size + node rect size
            }

            tree = tree.size([newHeight, newWidth]);

            // Compute the new tree layout.
            var nodes = tree.nodes(root).reverse(),
                links = tree.links(nodes);


            // Size link width according to n based on total n
            wscale = d3.scale.linear()
                .range([0, opts.nodeHeight || 25])
                .domain([0, treeData[opts.value]]);

            // Set widths between levels based on maxLabelLength.
            if (opts.maxLabelLength) {
                nodes.forEach(function (d) {
                    d.y = (d.depth * (maxLabelLength * 10)); //maxLabelLength * 10px
                });
            } else {
                nodes.forEach(function (d) {
                    d.y = (d.depth * (meanLabelLength * pxPerChar)); //meanLabelLength * 5px
                });
            }



            // Update the nodes
            node = svgGroup.selectAll("g.node")
                .data(nodes, function (d) {
                    return d[opts.id] || (d[opts.id] = ++i);
                });

            // Enter any new nodes at the parent's previous position.
            var nodeEnter = node.enter().append("g")
                // .call(dragListener)
                .attr("class", "node")
                .attr("transform", function (d) {
                    return "translate(" + source.y0 + "," + source.x0 + ")";
                })
                .on('click', click);

            /*
            nodeEnter.append("circle")
                .attr('class', 'nodeCircle')
                .attr("r", 0)
                .style("fill", function(d) {
                    return d._children ? "lightsteelblue" : "#fff";
                })
                .on('mouseover', tip.show)
                .on('mouseout', tip.hide);
            */

            var tooltip = d3.select("body")
                .append("div")
                .style("position", "absolute")
                .style("z-index", "10")
                .style("visibility", "hidden")
                .style("background", "white")
                .text("a simple tooltip")
                .style("font-size", "10px");

            nodeEnter.append("rect")
                .attr("class", "nodeRect")
                .attr("x", -2.5)
                .attr("y", function (d) {
                    return -wscale(d.value) / 2
                })
                .attr("height", function (d) {
                    return wscale(d.value)
                })
                .attr("width", 5)
                .style("fill", "white")
                .style("stroke", "white")
                .style("pointer-events", "all")
                .on('mouseover', opts.tooltip ? tip.show : null)
                .on('mouseout', opts.tooltip ? tip.hide : null);

            nodeEnter.append("text")
                .attr("x", function (d) {
                    return d[opts.childrenName] || d._children ? -10 : 10;
                })
                .attr("dy", ".35em")
                .attr('class', 'nodeText')
                .attr("text-anchor", function (d) {
                    return d[opts.childrenName] || d._children ? "end" : "start";
                })
                .text(function (d) {
                    return d[opts.name];
                })
                .style("fill-opacity", 0)
                .on('mouseover', function(d){
                  console.log(d.parent);
                  tooltip.text("["+d.parent.children[0].value + ","+ d.parent.children[1].value + "]");
                  return tooltip.style("visibility", "visible");})
                .on("mousemove", function(){
                  return tooltip.style("top", (d3.event.pageY-10)+"px").style("left",(d3.event.pageX+10)+"px");})
                .on("mouseout", function(){return tooltip.style("visibility", "hidden");});

            // phantom node to give us mouseover in a radius around it
            nodeEnter.append("circle")
                .attr('class', 'ghostCircle')
                .attr("r", 30)
                .attr("opacity", 0.2) // change this to zero to hide the target area
                .style("fill", "red")
                .attr('pointer-events', 'mouseover')
                .on("mouseover", function (node) {
                    overCircle(node);
                })
                .on("mouseout", function (node) {
                    outCircle(node);
                });

            // Update the text to reflect whether node has children or not.
            node.select('text')
                .attr("x", function (d) {
                    return d[opts.childrenName] || d._children ? -10 : 10;
                })
                .attr("text-anchor", function (d) {
                    return d[opts.childrenName] || d._children ? "end" : "start";
                })
                .text(function (d) {
                    return d[opts.name];
                });

            // Change the circle fill depending on whether it has children and is collapsed
            node.select("circle.nodeCircle")
                .attr("r", 4.5)
                .style("fill", function (d) {
                    return d._children ? "lightsteelblue" : "#fff";
                });

            // Transition nodes to their new position.
            var nodeUpdate = node.transition()
                .duration(duration)
                .attr("transform", function (d) {
                    return "translate(" + d.y + "," + d.x + ")";
                });

            // Fade the text in
            nodeUpdate.select("text")
                .style("fill-opacity", 1);

            // Transition exiting nodes to the parent's new position.
            var nodeExit = node.exit().transition()
                .duration(duration)
                .attr("transform", function (d) {
                    return "translate(" + source.y + "," + source.x + ")";
                })
                .remove();

            nodeExit.select("circle")
                .attr("r", 0);

            nodeExit.select("text")
                .style("fill-opacity", 0);

            // Update the links


            // probably not the best way or place to do this
            //   but start here with adjusting paths higher
            //   or lower to do like a stacked bar
            //   since our stroke-width will reflect size
            //   similar to a Sankey

            // 1. start by nesting our link paths by source
            var link_nested = d3.nest()
                .key(function (d) {
                    return d.source[opts.id]
                })
                .entries(links);
            // 2. manual method for stacking since d3.layout.stack
            //      did not work
            link_nested.forEach(function (d) {
                var ystacky = 0;
                d.values.reverse().forEach(function (dd) {
                    var ywidth = wscale(dd.target.value)
                    var srcwidth = wscale(dd.source.value)
                    srcwidth = isNaN(srcwidth) ? wscale.range()[1] / 2 : srcwidth;
                    ystacky = ystacky + ywidth;
                    dd.x = dd.source.x + srcwidth / 2 - ystacky + ywidth / 2;
                    dd.y = dd.source.y;
                    dd.ystacky = ystacky;
                })
            })


            var link = svgGroup.selectAll("path.link")
                .data(links, function (d) {
                    return d.target[opts.id];
                });

            // Enter any new links at the parent's previous position.
            link.enter().insert("path", "g")
                .attr("class", "link")
                .attr("d", function (d) {
                    var o = {
                        x: source.x0,
                        y: source.y0
                    };
                    return diagonal({
                        source: o,
                        target: o
                    });
                });

            link.style("stroke-width", function (d) {
                return wscale(d.target.value)
            });

            // Transition links to their new position.
            link.transition()
                .duration(duration)
                .attr("d", diagonal)
                .style("stroke", function (d) {
                    if (d.target.color) {
                        if (typeof d.target.color === 'string') {
                            return d3.lab(d.target.color)
                        } else {
                            return d3.hcl(
                                d.target.color.h,
                                d.target.color.c,
                                d.target.color.l
                            )
                        }
                    } else {
                        return "#ccc"
                    }
                });

            // Transition exiting nodes to the parent's new position.
            link.exit().transition()
                .duration(duration)
                .attr("d", function (d) {
                    var o = {
                        x: source.x,
                        y: source.y
                    };
                    return diagonal({
                        source: o,
                        target: o
                    });
                })
                .remove();

            // Stash the old positions for transition.
            nodes.forEach(function (d) {
                d.x0 = d.x;
                d.y0 = d.y;
            });

            dispatch.update({
                root: root,
                source: source
            });
        }




        // if tooltip then set it up
        if (opts.tooltip) {
            svgGroup.call(tip);
        }

        // Define the root
        root = treeData;
        root.x0 = viewerHeight / 2;
        root.y0 = 0;

        // Layout the tree initially and center on the root node.
        update(root);
        // since we can override node height and label length (width)
        // if zoom scale == 1 then auto scale to fit tree in container
        if (zoomListener.scale() == 1) {
            var xscale = viewerHeight / tree.size()[0] * 0.85,
                yscale = viewerWidth / tree.size()[1] * 0.85;
            if (xscale < yscale) {
                zoomListener.scale(xscale);
            } else {
                zoomListener.scale(yscale);
            }

        }

        centerNode(root);

    },

    resize: function (el, width, height, instance) {

    }

});
