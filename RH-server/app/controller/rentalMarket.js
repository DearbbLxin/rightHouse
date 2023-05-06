// 添加
'use strict';

const { Controller } = require('egg');
class RentalMarketController extends Controller {
  async insert() {
    const { ctx } = this;
    const rules = {
      houseId: 'number',
      userId: 'number'
    };
    const data = ctx.request.body;
    const token = ctx.header.authorization;
    data.userId = ctx.app.jwt.verify(token.slice(7), ctx.app.config.jwt.secret).data.id;
    ctx.validate(rules, data);
    const rentalMarketObj = await ctx.service.rentalMarket.selectByHouseId(data.houseId);
    if (rentalMarketObj) {
      const updateRentalMarketStatus = await ctx.service.rentalMarket.updateStatus({
        id: rentalMarketObj.id,
        status: 1
      });
      ctx.body = {
        status: 1,
        data: updateRentalMarketStatus
      };
    } else {
      const insertRentalMarket = await ctx.service.rentalMarket.insert(data);
      ctx.body = {
        status: 1,
        data: insertRentalMarket
      };
    }


  }
  async updateStatus() {
    const { ctx } = this;
    const rules = {
      id: 'number',
      status: 'number'
    };
    ctx.validate(rules, ctx.request.body);

    const updateRentalMarketStatus = await ctx.service.rentalMarket.updateStatus(ctx.request.body);
    ctx.body = {
      status: 1,
      data: updateRentalMarketStatus
    };
  }
  async list() {
    const { ctx } = this;
    const list = await ctx.service.rentalMarket.list(ctx.query);
    ctx.body = {
      status: 1,
      data: list.rows,
      count: list.count
    };
  }
  async selectById() {
    const { ctx } = this;
    const rentalMarketInfo = await ctx.service.rentalMarket.selectById(ctx.query.id);
    const token = ctx.header.authorization;
    const tenantId = ctx.app.jwt.verify(token.slice(7), ctx.app.config.jwt.secret).data.id;
    const isStar = await ctx.service.rentalMarket.checkHouseStar({
      rentalMarketId: ctx.query.id,
      tenantId,
      status: 1
    });
    if (isStar) {
      rentalMarketInfo.house.dataValues.isStar = true;
    } else {
      rentalMarketInfo.house.dataValues.isStar = false;
    }
    ctx.body = {
      status: 1,
      data: rentalMarketInfo
    };
  }
  async starHouse() {
    const { ctx } = this;
    const rules = {
      rentalMarketId: 'id'
    };
    ctx.validate(rules, ctx.query);
    const data = ctx.query;
    const token = ctx.header.authorization;
    data.tenantId = ctx.app.jwt.verify(token.slice(7), ctx.app.config.jwt.secret).data.id;
    const isStar = await ctx.service.rentalMarket.checkHouseStar(data);
    let starData = null;
    if (isStar && isStar.status === 1) {
      // 已经star,取消star
      starData = await ctx.service.rentalMarket.updateStarStatus(isStar.id, 0);
    } else if (isStar && isStar.status === 0) {
      // 已经取消star,继续star
      starData = await ctx.service.rentalMarket.updateStarStatus(isStar.id, 1);
    } else {
      // 没有star过，加入star
      starData = await ctx.service.rentalMarket.insertStarHouse(data);
    }
    ctx.body = {
      status: 1,
      data: isStar || starData
    };
  }
}
module.exports = RentalMarketController;

