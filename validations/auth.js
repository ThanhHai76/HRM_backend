const Joi = require('joi');

const registerValidator = (data) => {
    const rule = Joi.object({
        name: Joi.string().min(6).max(225).required(),
        companyName: Joi.string().max(255).allow('', null),
        email: Joi.string().min(6).max(225).required().email(),
        password: Joi.string().pattern(new RegExp('^[a-zA-Z0-9]{6,20}$')).required(),
    })

    return rule.validate(data);
}

module.exports.registerValidator = registerValidator;
