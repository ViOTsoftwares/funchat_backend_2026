import { ModuleModel, SubModuleModel } from "../models/index.js";
import { Pagination } from "../lib/pagination.js";
import { ColumnFilter } from "../lib/columnFilter.js";
import { isEmpty } from "../lib/isEmpty.js";

export const CreateModule = async (req, res) => {
  try {
    const { module, submodule, name, path, status } = req.body;
    const moduleName = module || name;
    const submoduleName = submodule;

    if (!moduleName || !path || !status) {
      return res.status(400).json({
        success: false,
        message: "Module, path and status are required",
      });
    }

    if (submoduleName) {
      const existSubModule = await SubModuleModel.findOne({ name: submodule });
      const existModule = await ModuleModel.findOne({ name: module });
      if (isEmpty(existModule)) {
        let newModule = await ModuleModel.create({
          name: moduleName,
          status,
        });
        await SubModuleModel.create({
          moduleId: newModule._id,
          module: moduleName,
          name: submoduleName,
          path,
          status,
        });
        return res
          .status(200)
          .json({ success: true, message: "Added successfully" });
      }
      if (!isEmpty(existSubModule)) {
        return res.status(500).json({
          success: false,
          errors: { submoduleName: "Already existed submodules" },
        });
      }
      await SubModuleModel.create({
        moduleId: existModule._id,
        module: moduleName,
        name: submoduleName,
        path,
        status,
      });
    } else {
      const existModule = await ModuleModel.findOne({ name: module });
      if (!isEmpty(existModule)) {
        return res.status(500).json({
          success: false,
          errors: { moduleName: "Already existed modules" },
        });
      }
      await ModuleModel.create({
        name: moduleName,
        path,
        status,
      });
    }

    return res
      .status(200)
      .json({ success: true, message: "Added successfully" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong" });
  }
};

export const ModuleList = async (req, res) => {
  try {
    let { page, limit, filter } = req.query;
    const rawFilter = filter || {};
    const moduleFilterValue = rawFilter.fs_module;
    const submoduleFilterValue = rawFilter.fs_submodule;

    const filterForModules = { ...rawFilter };
    delete filterForModules.fs_module;
    delete filterForModules.fs_submodule;

    const baseFilter = ColumnFilter(filterForModules);
    const { skip } = Pagination({ page, limit });
    const sort = { createdAt: -1 };

    const andConditions = [];
    if (!isEmpty(baseFilter)) andConditions.push(baseFilter);
    if (moduleFilterValue) {
      andConditions.push({ name: { $regex: moduleFilterValue, $options: "i" } });
    }

    if (submoduleFilterValue) {
      const submoduleMatches = await SubModuleModel.find({
        name: { $regex: submoduleFilterValue, $options: "i" },
      }).select("module moduleId");

      const namesFromSub = submoduleMatches
        .map((s) => s.module)
        .filter(Boolean);
      const idsFromSub = submoduleMatches
        .map((s) => s.moduleId)
        .filter(Boolean);

      let namesFromIds = [];
      if (idsFromSub.length > 0) {
        const modulesFromIds = await ModuleModel.find({
          _id: { $in: idsFromSub },
        }).select("name");
        namesFromIds = modulesFromIds.map((m) => m.name).filter(Boolean);
      }

      const allowedNames = Array.from(
        new Set([...namesFromSub, ...namesFromIds]),
      );

      if (allowedNames.length === 0) {
        return res.status(200).json({
          success: true,
          message: "Get all modules",
          result: { list: [], count: 0 },
        });
      }

      andConditions.push({ name: { $in: allowedNames } });
    }

    const finalFilter = andConditions.length ? { $and: andConditions } : {};

    const list = await ModuleModel.find(finalFilter)
      .limit(limit)
      .skip(skip)
      .sort(sort);

    const moduleNames = list.map((m) => m.name).filter(Boolean);
    const moduleIds = list.map((m) => m._id).filter(Boolean);
    const moduleIdToName = list.reduce((acc, m) => {
      if (m?._id && m?.name) acc[m._id.toString()] = m.name;
      return acc;
    }, {});

    const submodules = await SubModuleModel.find({
      $or: [{ module: { $in: moduleNames } }, { moduleId: { $in: moduleIds } }],
    }).sort({ createdAt: -1 });

    const submodulesByModule = submodules.reduce((acc, item) => {
      const key =
        item.module ||
        (item.moduleId ? moduleIdToName[item.moduleId.toString()] : undefined);
      if (!key) return acc;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    const listWithSubmodules = list.flatMap((m) => {
      const moduleSubmodules = submodulesByModule[m.name] || [];
      const hasPath = !isEmpty(m.path);
      const baseRow = {
        ...m.toObject(),
        module: m.name,
        submodule: "-",
        status: m.status,
        rowType: "module",
        submodules: moduleSubmodules,
      };

      if (moduleSubmodules.length === 0) {
        return hasPath ? [baseRow] : [];
      }

      const subRows = moduleSubmodules.map((sm) => ({
        ...m.toObject(),
        _id: sm?._id,
        module: m.name,
        submodule: sm?.name || "-",
        status: sm?.status || m.status,
        rowType: "submodule",
        submodules: moduleSubmodules,
      }));

      return hasPath ? [baseRow, ...subRows] : subRows;
    });

    const count = await ModuleModel.countDocuments(finalFilter);

    return res.status(200).json({
      success: true,
      message: "Get all modules",
      result: { list: listWithSubmodules, count },
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong" });
  }
};

export const UpdateModule = async (req, res) => {
  try {
    const { id, name, path, status } = req.body;
    const existingModule = await ModuleModel.findById(id);
    const existingSubmodule = existingModule
      ? null
      : await SubModuleModel.findById(id);

    if (!existingModule && !existingSubmodule) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (path !== undefined) updateData.path = path;
    if (status !== undefined) updateData.status = status;

    if (Object.keys(updateData).length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No update fields provided" });
    }

    if (existingModule) {
      await ModuleModel.updateOne({ _id: existingModule._id }, updateData);
    } else {
      await SubModuleModel.updateOne({ _id: existingSubmodule._id }, updateData);
    }

    return res
      .status(200)
      .json({ success: true, message: "Updated successfully" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong" });
  }
};

export const OneModule = async (req, res) => {
  try {
    const { id } = req.params;
    const moduleDoc = await ModuleModel.findById(id);
    if (moduleDoc) {
      return res.status(200).json({
        success: true,
        message: "Get module",
        result: {
          ...moduleDoc.toObject(),
          type: "module",
          module: moduleDoc.name,
        },
      });
    }

    const submoduleDoc = await SubModuleModel.findById(id);
    if (submoduleDoc) {
      return res.status(200).json({
        success: true,
        message: "Get submodule",
        result: {
          ...submoduleDoc.toObject(),
          type: "submodule",
          module: submoduleDoc.module,
          submodule: submoduleDoc.name,
        },
      });
    }
    return res.status(404).json({ success: false, message: "Not found" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong" });
  }
};

export const DeleteModule = async (req, res) => {
  try {
    const { id } = req.body;
    await ModuleModel.deleteOne({ _id: id });
    return res.status(200).json({
      success: true,
      message: "Deleted succcessfully",
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong" });
  }
};
