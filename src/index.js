//
// 大陸地図作成
//

// パラメータ
import * as d3_voronoi from "d3-voronoi"
import * as d3_polygon from "d3-polygon"
import * as d3_select from "d3-selection"
import * as d3_interpolate from "d3-interpolate"

const width = 1600;
const height = 800;
const border = 20;

const crusts = 400;         // クラスト（地形タイル）の数
const ratio = .35;           // 陸地の割合
const continent_number = 5; // 大陸塊の数。3〜。多くても意外と破綻しない
const smoothness = .6;      // 地形の滑らかさ。.25〜1.5ぐらい

const total = width * height;
const slen = Math.sqrt(crusts); // height / border;

let voronoi = d3_voronoi.voronoi()
    .size([width,height])
    .x(function (e) {
        return e.x
    }).y(function (e) {
        return e.y
    });


function d_rand(size) {
    let v = 0.0
    for (let i = 0;i < 12;i++) {
        v += Math.random()
    }
    return (v - 6) * size
}

// 大陸を表す構造体
class Continent {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 0
        this.area = null;
    }
}

// 陸塊の代表点を作る
let continents = []
for (let i = 0; i < continent_number; i++) {
    let x = Math.random() * (width - border * 4) + border * 2 ;
    let y = Math.random() * height;
    continents.push(new Continent(x, y));
}

// ボロノイ分割で各大陸のエリアを求める
voronoi(continents).polygons().forEach(function (e, ix) {
    let c = d3_polygon.polygonCentroid(e);
    continents[ix].x = c[0]
    continents[ix].y = c[1]
    continents[ix].size = Math.sqrt(d3_polygon.polygonArea(e))
    continents[ix].area = e
});


// クラストを表す構造体
class Crust {
    constructor(x, y, a = 1) {
        if (x < 0) {
            x = 0
        } else if (x > width) {
            x = width
        }
        this.x = x;
        if (y < 0) {
            y = 0
        } else if(y > height) {
            y = height
        }
        this.y = y;
        this.altitude = a
    }
}

let data = [];
// 代表点の周りに肉付けして、陸のクラストを作る
let ts = continents.reduce(function (a, v) {
    return a + v.size
}, 0);
for (let i = 0; i < (crusts * ratio); i++) {
    let r = Math.random() * ts;

    for (const c of continents) {
        r -= c.size;
        if (r > 0) {
            continue
        }
        let s = c.size *.4
        while (true) {
            let x = d_rand(s * 1.6) + c.x;
            let y = d_rand(s * .8) + c.y;
            let p = [x, y];
            if (d3_polygon.polygonContains(c.area, p)) {
                data.push(new Crust(x, y,  Math.random() * .5 + .5));
                break
            }
        }
        break
    }
}

// 海になるクラストを作る
for (let i = 0;i < crusts * (1 - ratio);i++) {
    let x = Math.random() * (width - 2 * border) + border;
    let y = Math.random() * height;
    data.push(new Crust(x, y, Math.random() * .2 - 1));
}


// 地図の左右をなるべく海にする
for (let i = 0; i < slen; i++) {
    data.push( new Crust(border, i * height / slen, -1));
    data.push(new Crust(width - border, i * height / slen, -1));
}


// 標高計算
function ease_altitude() {
    // ボロノイ分割して隣接点を求める
    let links = voronoi(data).links();
    // 隣接点同士を少しずつ均す
    for (let i = 0; i < Math.sqrt(crusts) * ratio * smoothness; i++) {
        links.forEach(function (e, ix) {
            // 単純な平均操作より、この式のほうがいい感じになる
            let ds = e.source.altitude / 12;
            let dt = e.target.altitude / 12;

            e.source.altitude += dt - ds
            e.target.altitude += ds - dt
        })
    }
}
ease_altitude()

// 陸/海比率の調整
// 標高順にソート
function adjust_ratio() {
    let p2 = Array.from(data)
    p2.sort(function (a, b) {
        return b.altitude - a.altitude
    });
    // 面積を求めるのでボロノイ分割で領域を求める
    let vorn = voronoi(p2);

    // 全体にしめる面積比が陸地の割合になる点を探す
    let cur = 0.0;
    let finished = false
    vorn.polygons().forEach(function (e, ix) {
        if (finished) {
            return
        }
        cur += Math.abs(d3_polygon.polygonArea(e));
        if (cur >= total * ratio) {
            let base = e.data.altitude

            // その地点の標高が0になるよう全体を調整
            data.forEach(function (e) {
                e.altitude -= base
            })
            finished = true
        }
    })
}

adjust_ratio()

// 海岸線を列挙する
function enum_shore(proc) {
    let vorn = voronoi(data)
    vorn.links().forEach(function (e) {
        let tgt = null
        let sea = null
        if (e.source.altitude < 0 && e.target.altitude >= 0) {
            tgt = e.target
            sea = e.source
        } else if (e.source.altitude >= 0 && e.target.altitude < 0) {
            tgt = e.source
            sea = e.target
        }
        if (tgt == null) {
            return
        }

        let tc = vorn.find(tgt.x, tgt.y)
        let sc = vorn.find(sea.x, sea.y)
        for (let it of vorn.cells[tc.index].halfedges) {
            for (let is of vorn.cells[sc.index].halfedges) {
                if (it == is) {
                    proc(vorn.edges[it], tgt, sea)
                    return
                }
            }
        }
    })
}

// 海岸線を取得
function get_shore() {
    let result = []

    enum_shore(function (edge, tgt, sea) {
        result.push(edge)
    })

    return result
}

// 調整前の海岸線を保存しておく
let adjusting = [get_shore()]

// 標高差がありすぎる点は分割
for (let i = 0;i < 4 ;i++) {
    let splitted = false
    let vorn = voronoi(data)
    vorn.links().forEach(function (e) {
        if (e.source.altitude < 0 && e.target.altitude < 0) {
            // 双方海。処理しない
            return
        }
        let d = e.source.altitude - e.target.altitude
        if (Math.abs(d) > .12) {
            // 分割
            let lx = e.source.x - e.target.x
            let ly = e.source.y - e.target.y
            let c = new Crust(e.source.x - lx / 2, e.source.y - ly / 2, e.source.altitude - d / 2)
            data.push(c)
            splitted = true
        }
    })
    adjust_ratio()
    if (!splitted) {
        break
    }
}
adjusting.push(get_shore())


//海岸線を細かくする
for (let i = 0;i < 10 ;i++) {
    let splitted = false
    enum_shore(function (edge, tgt, sea) {
        // 海岸線の長さを取得
        let lx = edge[0][0] - edge[1][0]
        let ly = edge[0][1] - edge[1][1]
        let l = Math.sqrt(lx * lx + ly + ly)

        if (l < border) {
            return
        }
        // 長過ぎたら分割

        // 陸側に少しへこます
        let sx = (tgt.x - sea.x) * .15
        let sy = (tgt.y - sea.y) * .15
        data.push(new Crust(
            tgt.x + lx / 5 + sx,
            tgt.y + ly / 5 + sy,
            tgt.altitude))
        tgt.x -= lx / 5 - sx
        tgt.y -= ly / 5 - sy

        splitted = true;
    })
    adjust_ratio()
    adjusting.push(get_shore())
    if (!splitted) {
        break
    }
}

// 表示
let svg = d3_select.select("body").append("svg")
    .attr("width", width)
    .attr("height", height);

// 標高から色に変換
function alt2col_dense(depth) {
    if (depth < 0) {
        let s = d3_interpolate.interpolateLab("#028", "#148")
        return s(depth + 1.0)
    } else if (depth < 0.5) {
        let g = d3_interpolate.interpolateLab("#083", "#be7")
        return g(depth * 2)
    }
    let g = d3_interpolate.interpolateLab("#be7", "#752")
    return g((depth - .5) * 2)
}

function alt2col_light(depth) {
    if (depth < 0) {
        let s = d3_interpolate.interpolateLab("lightblue", "azure")
        return s(depth + 1.0)
    } else if (depth < 0.5) {
        let g = d3_interpolate.interpolateLab("white", "lightgray")
        return g(depth * 2)
    }
    let g = d3_interpolate.interpolateLab("lightgray", "gray")
    return g((depth - .5)  / .5)
}

let vorn = voronoi(data)
vorn.polygons().forEach(function (e) {
    let p = svg.append("polygon")
        .attr("points", e)
        .attr("stroke-width", 0)

    let depth = e.data.altitude;
    // let col = alt2col_dense(depth)
    let col = alt2col_light(depth)
    p.attr("fill", col)
        // .attr("stroke", col)
});
/*
let s = d3.interpolateHslLong("red", "blue")
adjusting.forEach(function (adj, ix) {
    let col = s(ix / (adjusting.length - 1))

    adj.forEach(function (e) {
        svg.append(("line"))
            .attr("x1", e[0][0])
            .attr("y1", e[0][1])
            .attr("x2", e[1][0])
            .attr("y2", e[1][1])
            .attr("stroke", col)
            .attr("stroke-width", .5)
    })
})
*/
adjusting.pop().forEach(function (e) {
// let links = p.links(data);
// links.forEach(function (e) {
    let l = svg.append("line")
        .attr("x1", e[0][0])
        .attr("y1", e[0][1])
        .attr("x2", e[1][0])
        .attr("y2", e[1][1])
        .attr("stroke", "gray")
        // .attr("stroke-width", 1)
})
