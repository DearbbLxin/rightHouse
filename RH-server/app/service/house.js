const { Service } = require('egg');
class HouseService extends Service {
  async insert(data) {
    const houseInsert = await this.ctx.model.House.create(data);
    return houseInsert;
  }
  async select(data) {
    const Op = this.app.Sequelize.Op;
    const houseList = await this.ctx.model.House.findAll({
      where: {
        ...data,
        status: {
          // 不查删除的
          [Op.ne]: 3
        }
      },
      // 排序
      order: [
        [ 'createdAt', 'DESC' ]
      ]
    });
    return houseList;
  }
  async selectById(data) {
    const houseAddress = await this.ctx.model.House.findOne({
      // attributes: [ 'provinceId', 'cityId', 'areaId', 'provinceName', 'cityName', 'areaName', 'addresInfo' ],
      where: data,
      include: {
        model: this.ctx.model.RentalMarket,
        where: {
          status: 1
        },
        required: false
      }
    });
    return houseAddress;
  }
  async update(data) {
    const house = await this.selectById({
      id: data.id,
      userId: data.userId
    });
    for (const key in data) {
      house[key] = data[key];
    }
    await house.save();
    return house;
  }
  async deleteChild(pid) {
    const transaction = await this.ctx.model.transaction();
    try {
      const houseList = await this.ctx.model.House.findAll({
        where: {
          parentId: pid
        }
      }, { transaction });
      if (houseList && houseList.length > 0) {
        for (let i = 0; i < houseList.length; i++) {
          const item = houseList[i];
          await item.update({
            status: 3
          }, { transaction });
          await this.deleteChild(item.id);
        }
      }
      transaction.commit();
      return true;
    } catch (error) {
      transaction.rollback();
      return false;
    }
  }
  async delete(data) {
    const transaction = await this.ctx.model.transaction();
    try {
      const house = await this.ctx.model.House.update({
        status: 3
      }, {
        transaction,
        where: {
          id: data.id,
          userId: data.userId
        }
      });
      const deleteChildType = await this.deleteChild(data.id);
      if (deleteChildType) {
        await transaction.commit();
      } else {
        await transaction.rollback();
      }
      return house;
    } catch (error) {
      await transaction.rollback();
    }

  }
  // 入住
  async joinTenant(data) {
    const houseId = data.houseId;
    const tenantId = data.tenantId;
    const landlordId = data.landlordId;
    const transaction = await this.ctx.model.transaction();
    try {
      // 判断租客是否关联房子
      const tenantInHouse = await this.ctx.model.HouseLinkTenant.findOne({
        where: {
          houseId,
          tenantId,
          status: 1
        }
      });
      // 如果有关联就不再继续
      if (tenantInHouse) {
        return false;
      }
      // 给房子-租客关联表添加数据
      await this.ctx.model.HouseLinkTenant.create({
        houseId,
        tenantId
      }, {
        transaction
      });

      // 判断租客是否关联房东
      const tenantInLandlord = await this.ctx.model.LandlordLinkTenant.findOne({
        where: {
          landlordId,
          tenantId
        }
      });
      if (!tenantInLandlord) {
        // 给房东-租客关联表添加数据
        await this.ctx.model.LandlordLinkTenant.create({
          landlordId,
          tenantId
        }, {
          transaction
        });
      }
      await transaction.commit();
      return true;
    } catch (e) {
      await transaction.rollback();
      return false;
    }

  }
  // 获取租客已经租的房间列表
  async getTenantsByHouseId(data) {
    const houseId = data.houseId;
    let where = {};
    if (data.tenantStatus === 'all') {
      where = {
        '$houses.id$': houseId
      };
    } else {
      where = {
        '$houses.id$': houseId,
        '$houses.houseLinkTenant.status$': data.tenantStatus
      };
    }
    return await this.ctx.model.TenantsUser.findAll({
      include: {
        model: this.ctx.model.House,
        attributes: [ 'name', 'id', 'headImg', 'price', 'provinceName', 'cityName', 'areaName', 'addresInfo' ],
        through: {
          attributes: [ 'createdAt', 'updatedAt', 'status' ]
        }
      },
      where,
      // 排序
      order: [[ this.ctx.model.House, this.ctx.model.HouseLinkTenant, 'createdAt', 'DESC' ]]
    });
  }
  // 报修
  async maintenance(data) {
    return await this.app.model.HouseMaintenance.create(data);
  }
  // 解决报修
  async solveMaintenance(data) {
    return await this.app.model.HouseMaintenance.update({
      status: 1
    }, {
      where: {
        id: data.id
      }
    });
  }
  // 退租
  async houseOut(data) {
    const transaction = await this.ctx.model.transaction();
    try {
      // 解除租客和房子的关联
      this.ctx.model.HouseLinkTenant.update({
        status: 0
      }, {
        transaction,
        where: {
          houseId: data.houseId,
          tenantId: data.tenantId
        }
      });
      // 计算房东与租客的关联房屋数
      const findAllHouseBytenantIdAndlandlordId = await this.app.model.House.count({
        include: [{
          model: this.app.model.TenantsUser,
          where: {
            id: data.tenantId
          },
          // 限制关联表状态
          through: {
            where: {
              status: 1
            }
          }
        }],
        where: {
          userId: data.landlordId
        }
      }, { transaction });
      // 如果和房东关联的住房就剩1条记录  则解除房东和租客的关联
      if (findAllHouseBytenantIdAndlandlordId === 1) {
        // 解除租客和房东的关联
        await this.ctx.model.LandlordLinkTenant.update({
          status: 0
        }, {
          transaction,
          where: {
            landlordId: data.landlordId,
            tenantId: data.tenantId
          }
        });
      }
      // 计算该房屋的租客数量
      // 。。。
      await transaction.commit();
      return true;
    } catch (error) {
      console.log(error);
      await transaction.rollback();
      return false;
    }
  }
  async list(params) {
    const Op = this.app.Sequelize.Op;
    const option = {
      where: {
        status: {
          [Op.ne]: 3
        },
        name: {
          [Op.like]: params.name ? `%${params.name}%` : '%'
        }
      },
      include: [
        {
          // 房子的租客
          model: this.ctx.model.TenantsUser,
          attributes: [ 'name', 'id', 'headImg', 'phone', 'createdAt' ],
          required: false
        }
      ],
      // 排序
      order: [
        [ 'createdAt', 'DESC' ]
      ]
    };
    // 是否分页
    if (
      params.size &&
      params.index &&
      params.size > 0 &&
      params.index > 0
    ) {
      option.limit = Number(params.size);
      option.offset = (Number(params.size) * (Number(params.index) - 1));
    }
    // 搜索参数
    if (
      params.status
    ) {
      option.where.status = params.status;
    }
    if (
      params.address
    ) {
      option.where = {
        ...option.where,
        [Op.or]: [
          {
            provinceName: {
              [Op.like]: `%${params.address}%`
            }
          },
          {
            cityName: {
              [Op.like]: `%${params.address}%`
            }
          },
          {
            areaName: {
              [Op.like]: `%${params.address}%`
            }
          },
          {
            addresInfo: {
              [Op.like]: `%${params.address}%`
            }
          }
        ]
      };
    }
    // option.attributes = [ 'id', 'name', 'userId', 'parentId', 'provinceId', 'cityId', 'areaId', 'provinceName', 'cityName', 'areaName', 'addresInfo'];
    const data = await this.ctx.model.House.findAndCountAll(option);
    return data;
  }
}
module.exports = HouseService;