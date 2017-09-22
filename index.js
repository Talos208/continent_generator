//
// 大陸地図作成
//

// パラメータ
const width = 1600;
const height = 800;
const border = 20;

const crusts = 200;         // クラスト（地形タイル）の数
const ratio = .35;           // 陸地の割合
const continent_number = 17; // 大陸塊の数。3〜。多くても意外と破綻しない
const smoothness = .5;      // 地形の滑らかさ。.25〜1.5ぐらい

const total = width * height;
const slen = height / border;

let voronoi = d3.geom.voronoi()
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
voronoi(continents).forEach(function (e, ix) {
    let c = d3.polygonCentroid(e);
    continents[ix].x = c[0]
    continents[ix].y = c[1]
    continents[ix].size = Math.sqrt(d3.polygonArea(e))
    continents[ix].area = e
});


// クラストを表す構造体
class Crust {
    constructor(x, y, a = 1) {
        this.x = x;
        this.y = y;
        this.altitude = a
    }
}

let data = [];
// 代表点の周りに肉付けして、陸のクラストを作る
for (let i = 0; i < (crusts * ratio / continent_number); i++) {
    continents.forEach(function (c, ix) {
        let s = c.size / 3
        while (true) {
            let x = d_rand(s) + c.x;
            let y = d_rand(s) + c.y;
            let p = [x, y];
            if (d3.polygonContains(c.area, p)) {
                data.push(new Crust(x, y,  Math.pow(Math.random(), 1.5) * .5 + .5));
                break
            }
        }
    });
}

// 海になるクラストを作る
for (let i = 0;i < crusts * (1 - ratio);i++) {
    let x = Math.random() * (width - 2 * border) + border;
    let y = Math.random() * height;
    data.push(new Crust(x, y, Math.random() * .2 - 1));
}


// 地図の左右をなるべく海にする
for (let i = 0; i < crusts / 10; i++) {
    data.push( new Crust(border, i * height / slen, -1));
    data.push(new Crust(width - border, i * height / slen, -1));
}


// 標高計算
let p2 = Array.from(data)
// p2.splice(crusts);

// ボロノイ分割して隣接点を求める
let links = voronoi.links(p2);

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

// 陸/海比率の調整
// 標高順にソート
p2.sort(function (a, b) {
    return b.altitude - a.altitude
});
// 面積を求めるのでボロノイ分割で領域を求める
let poly = voronoi(p2);

// 全体にしめる面積比が陸地の割合になる点を探す
let cur = 0.0;
let finished = false
poly.forEach(function (e, ix) {
    if (finished) {
        return
    }
    cur += Math.abs(d3.polygonArea(e));
    if (cur >= total * ratio) {
        let base = e.point.altitude

        // その地点の標高が0になるよう全体を調整
        data.forEach(function (e) {
            e.altitude -= base
        })
        finished = true
    }
})


// 陸だけ細かくする
for (let i = 0;i < 8 ;i++) {
    let splitted = false
    poly = voronoi(data)
    voronoi.links(data).forEach(function (e) {
        if (e.source.altitude <= 0 && e.target.altitude <= 0) {
            // 双方海。処理しない
            return
        }

        let d = e.source.altitude - e.target.altitude

        if (Math.abs(d) > .15) {
            // 分割
            let lx = e.source.x - e.target.x
            let ly = e.source.y - e.target.y
            let c = new Crust(e.source.x - lx / 2, e.source.y - ly / 2, e.source.altitude - d / 2)
            data.push(c)
            splitted = true
        }
    })
    if (!splitted) {
        break
    }
}

// 表示
let svg = d3.select("body").append("svg")
    .attr("width", width)
    .attr("height", height);

// 標高から色に変換
function alt2col(depth) {
    if (depth < -.67) {
        return  "#028";
    } else if (depth < -.33) {
        return "#083480";
    } else if (depth < 0) {
        return "#148";
    } else if (depth < .1) {
        return "#083";
    } else if (depth < .2) {
        return "#393";
    } else if (depth < .3) {
        return "#5a4";
    } else if (depth < .4) {
        return "#8c5";
    } else if (depth < .5) {
        return "#be7";
    } else if (depth < .6) {
        return "#ab5";
    } else if (depth < .7) {
        return "#993";
    } else if (depth < .8) {
        return "#872";
    } else if (depth < .9) {
        return "#862";
    }
    return "#752";
}

poly.forEach(function (e) {
    let p = svg.append("polygon")
        .attr("points", e)
        .attr("stroke", "gray")
        .attr("stroke-width", 0)
        // .attr("fill", "white")

    let depth = e.point.altitude;
    let col = alt2col(depth)
    p.attr("fill", col)
        // .attr("stroke", col)

    // if (altitude > 0) {
    //     p.attr("stroke", "#541")
    // } else {
    //     p.attr("stroke", "#268")
    // }


});


// let links = p.links(data);
// links.forEach(function (e) {
//     let l = svg.append("line")
//         .attr("x1", e.source.x)
//         .attr("y1", e.source.y)
//         .attr("x2", e.target.x)
//         .attr("y2", e.target.y)
//         .attr("stroke", "#f66")
//         .attr("stroke-width", 1)
// })
